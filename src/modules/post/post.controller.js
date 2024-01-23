import { InvalidEditor, MissingTitle, NoPermissions, NoValidationAvailable, NotFound } from '../../errors.js'
import { ACTIVE_POSTHISTORY_WHERE, SYSTEM_IDS } from '../../constants.js'

import { allPostsPaginated, postWithContentById } from './post.service.js'
import { allPostHistoriesPaginated, createPostHistory, replaceActivePostHistory } from './postHistory.service.js'
import { allReviewsForPostIdPaginated, reviewByUserIdAndToPostId } from './postReview.service.js'

import { createEntity, updateEntity } from '../entity/entity.service.js'
import { createReview, updateReview } from '../review/review.service.js'

import { getAuthenticatedUserSession } from '../user/user.controller.js'
import { postAuthors } from '../user/user.service.js'

import { validateBioEditor, validateEntityEditor } from '../lexical/lexical.controller.js'
import { getEntityMentions } from '../lexical/lexical.service.js'

import { getSystemPostRelations, userHasPermissionWriteForPostByPostHistory } from '../permission/permission.service.js'

const { SYSTEM, ENTITY, BIO, REVIEW } = SYSTEM_IDS

const validationEditors = {
  [ENTITY]: validateEntityEditor,
  [BIO]: validateBioEditor,
  [REVIEW]: validateBioEditor
}

/**
 * **Only usable when route has the postExists middleware.**
 * @param {Fastify.Request} request
 * @returns {Awaited<ReturnType<import('./post.service.js').postWithContentById>>}
 */
export function getMiddlewarePost (request) {
  return request.post
}

const excludeBioPosts = {
  outRelations: {
    some: {
      isSystem: true,
      toPostId: {
        not: 'bio'
      }
    }
  }
}

/**
 * @param {Fastify.Request} request
 * @param {Fastify.Reply} reply
 */
export async function getAllPosts (request, reply) {
  const { cursor } = request.query
  let filter = request.body

  if (filter.AND) filter.AND.push(excludeBioPosts)
  else {
    filter = {
      AND: [{
        ...filter
      },
      { ...excludeBioPosts }
      ]
    }
  }

  const { posts, count } = await allPostsPaginated(request.server.prisma, cursor, filter)

  if (posts.length === 0) {
    return {
      result: [],
      cursor,
      count
    }
  }

  return {
    result: posts,
    cursor: posts[posts.length - 1].id,
    count
  }
}

/**
 * @param {Fastify.Request} request
 * @param {Fastify.Reply} reply
 */
export async function getAllSystemPosts (request, reply) {
  const { cursor } = request.query
  const { posts, count } = await allPostsPaginated(request.server.prisma, cursor, {
    outRelations: {
      some: {
        toPostId: SYSTEM
      }
    }
  })

  if (posts.length === 0) {
    return {
      result: [],
      cursor,
      count
    }
  }

  return {
    result: posts,
    cursor: posts[posts.length - 1].id,
    count
  }
}

/**
 * @param {Fastify.Request} request
 * @param {Fastify.Reply} reply
 */
export async function getPostById (request, reply) {
  const post = getMiddlewarePost(request)

  return post
}

/**
 * @param {Fastify.Request} request
 * @param {Fastify.Reply} reply
 */
export async function getPostHistoriesByPostId (request, reply) {
  const { cursor } = request.query
  const { id } = request.params

  const res = await allPostHistoriesPaginated(request.server.prisma, cursor, {
    postId: id
  })

  if (res.length === 0) {
    return {
      result: [],
      cursor
    }
  }

  return {
    result: res,
    cursor: res[res.length - 1].id
  }
}

/**
 * @param {Fastify.Request} request
 * @param {Fastify.Reply} reply
 */
export async function createEntityPost (request, reply) {
  const { language, /* content, */ title } = request.body
  // Content comes from validateEntityEditor.

  if (!title || title.length === 0) return MissingTitle(reply)

  const session = getAuthenticatedUserSession(request)

  const { content: sanitizedContent, valid } = await validateEntityEditor(request, reply, true)

  if (!valid) return InvalidEditor(reply)

  const stringifiedContent = JSON.stringify(sanitizedContent)

  const mentions = await getEntityMentions(stringifiedContent)

  /**
   * @type {PrismaTypes.PostHistory}
   */
  const dataToInsert = {
    title,
    language,
    content: stringifiedContent
  }

  return await createEntity(request.server.prisma, {
    userId: session.user.id,
    data: dataToInsert,
    mentions
  })
}

/**
 * This is a global Post update, it should handle any kind of update.
 * @param {Fastify.Request} request
 * @param {Fastify.Reply} reply
 */
export async function updatePostById (request, reply) {
  const prisma = request.server.prisma

  const post = getMiddlewarePost(request)

  const session = getAuthenticatedUserSession(request)

  const activePostHistory = post.postHistory[0]

  const systemRelations = await getSystemPostRelations(prisma, post.id)
  const sanitizedSystemRelations = systemRelations.map((sysRelation) => ({ isSystem: sysRelation.isSystem, toPostId: sysRelation.toPostId }))

  const hasPermission = await userHasPermissionWriteForPostByPostHistory(prisma, {
    userId: session.user.id,
    postHistoryId: activePostHistory.id,
    systemRelations
  })

  if (!hasPermission) return NoPermissions(reply)

  const { /* content, */ title, language } = request.body
  // Content comes from validate x Editor.

  // TODO: Add LANGUAGE validation.

  if (!title || title.length === 0) return MissingTitle(reply)

  const isEntity = systemRelations.some((sysRelation) => sysRelation.toPostId === ENTITY) && ENTITY
  const isBio = systemRelations.some((sysRelation) => sysRelation.toPostId === BIO) && BIO
  const isReview = systemRelations.some((sysRelation) => sysRelation.toPostId === REVIEW) && REVIEW

  const validateEditor = validationEditors[isEntity || isBio || isReview]

  const { content: sanitizedContent, valid } = await validateEditor(request, reply, true)

  if (!sanitizedContent) return NoValidationAvailable(reply)

  if (!valid) return InvalidEditor(reply)

  const stringifiedContent = JSON.stringify(sanitizedContent)

  const mentions = await getEntityMentions(stringifiedContent)
  const outRelations = mentions.map((mentionPostId) => ({
    isSystem: false,
    toPostId: mentionPostId
  }))

  if (isEntity) {
    await updateEntity(prisma, {
      post,
      outRelations,
      systemRelations: sanitizedSystemRelations
    })

    /**
     * @type {PrismaTypes.PostHistory}
     */
    const dataToInsert = {
      title,
      language,
      content: stringifiedContent,
      postId: post.id
    }

    return await replaceActivePostHistory(prisma, session.user.id, dataToInsert)
  }

  if (isBio) {
    const { language } = request.body

    /**
     * @type {PrismaTypes.PostHistory}
     */
    const dataToInsert = {
      title: title || activePostHistory.title || 'Bio',
      language,
      content: stringifiedContent,
      postId: post.id
    }

    return await replaceActivePostHistory(prisma, session.user.id, dataToInsert)
  }

  if (isReview) {
    const { type } = request.body

    const postReview = request.postReview || await reviewByUserIdAndToPostId(prisma, session.user.id, { fromPostId: post.id })

    await updateReview(prisma, {
      review: postReview,
      postId: post.id,
      type,
      outRelations,
      systemRelations: sanitizedSystemRelations
    })

    /**
     * @type {PrismaTypes.PostHistory}
     */
    const dataToInsert = {
      title,
      language,
      content: stringifiedContent,
      postId: post.id
    }

    return await replaceActivePostHistory(request.server.prisma, session.user.id, dataToInsert)
  }
}

/**
 * @param {Fastify.Request} request
 * @param {Fastify.Reply} reply
 */
export async function upsertReview (request, reply) {
  const { id } = request.params

  // Does post we're doing a review for exist?
  const post = await postWithContentById(request.server.prisma, id)

  if (!post) return NotFound(reply)

  // Can we do a review for it?
  // TODO: In the future, allow reviews on anything (But maybe not reviews).
  if (!post.outRelations.some((relation) => relation && relation.isSystem && relation.toPost.id === ENTITY)) {
    return reply.status(400).send({ message: "can't do review for this type of content" })
  }

  const { type } = request.body

  const session = getAuthenticatedUserSession(request)

  const postReview = await reviewByUserIdAndToPostId(request.server.prisma, session.user.id, { toPostId: post.id })

  if (!postReview) {
    const { language, /* content, */ title } = request.body
    // Content comes from validateReviewEditor.

    if (!title || title.length === 0) return MissingTitle(reply)

    // TODO: Create validateReviewEditor
    const { content: sanitizedContent, valid } = await validateBioEditor(request, reply, true)

    if (!valid) return InvalidEditor(request)

    const stringifiedContent = JSON.stringify(sanitizedContent)

    const mentions = await getEntityMentions(stringifiedContent)
    const outRelations = mentions.map((mentionPostId) => ({
      isSystem: false,
      toPostId: mentionPostId
    }))

    const id = await createReview(request.server.prisma, {
      userId: session.user.id,
      type,
      toPostId: post.id,
      outRelations
    })

    /**
     * @type {PrismaTypes.PostHistory}
     */
    const dataToInsert = {
      title,
      language,
      content: stringifiedContent,
      postId: id,
      endTimestamp: ACTIVE_POSTHISTORY_WHERE.endTimestamp.equals
    }

    await createPostHistory(request.server.prisma, session.user.id, dataToInsert)

    return { id }
  } else {
    request.post = postReview.fromPost // updatePostById requires existing post.
    request.body.type = type
    request.postReview = postReview
    return await updatePostById(request, reply)
  }
}

/**
 * @param {Fastify.Request} request
 * @param {Fastify.Reply} reply
 */
export async function getAllPostReviews (request, reply) {
  const { id } = request.params
  const { cursor } = request.query

  const { postReviews, count } = await allReviewsForPostIdPaginated(request.server.prisma, id, cursor)

  if (postReviews.length === 0) {
    return {
      result: [],
      cursor,
      count
    }
  }

  return {
    result: postReviews,
    cursor: postReviews[postReviews.length - 1].id,
    count
  }
}

export async function getUserReviewByPostId (request, reply) {
  const { id } = request.params

  const session = getAuthenticatedUserSession(request)

  const res = await reviewByUserIdAndToPostId(request.server.prisma, session.user.id, { toPostId: id })

  if (!res) return NotFound(reply)

  return res
}

/**
 * @param {Fastify.Request} request
 * @param {Fastify.Reply} reply
 */
export async function getPostAuthors (request, reply) {
  const { id } = request.params

  const res = await postAuthors(request.server.prisma, id)

  if (!res) return NotFound(reply)

  return res
}
