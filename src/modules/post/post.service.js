import { ACTIVE_POSTHISTORY_WHERE } from '../../schemas.js'

/**
 * @type {import('../../../.prisma/client).Prisma.PostInclude}
 */
export const activePostHistoryInclude = {
  postHistory: {
    where: ACTIVE_POSTHISTORY_WHERE,
    take: 1
  }
}

/**
 * @param {PrismaClient} prisma
 * @param {import('../../../.prisma/client').Prisma.PostWhereInput} filter
 * @param {import('../../../.prisma/client').Prisma.PostInclude} include
 */
export async function allPostsPaginated (prisma, cursor, filter) {
  return await prisma.post.findMany({
    take: 50,
    skip: cursor ? 1 : undefined,
    cursor: cursor
      ? {
          id: cursor
        }
      : undefined,
    where: filter,
    include: activePostHistoryInclude,
    orderBy: {
      createdTimestamp: 'desc'
    }
  })
}

/**
 * @param {PrismaClient} prisma
 */
export async function postWithContentById (prisma, id) {
  return await prisma.post.findFirst({
    where: {
      id
    },
    include: activePostHistoryInclude
  })
}

/**
 * @param {PrismaClient} prisma
 */
// export async function postRelationsByFromPostId (prisma, id) {
//   return await prisma.postRelation.findMany({
//     where: {
//       fromPostId: id
//     }
//   })
// }