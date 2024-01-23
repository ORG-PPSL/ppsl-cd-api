import lexical from 'lexical'
import lexicalHeadless from '@lexical/headless'
import { bioConfig } from './ppsl-cd-lexical-shared/src/editors/Bio/config.js'
import { defaultTheme, readOnlyTheme } from './ppsl-cd-lexical-shared/src/editors/theme.js'
import { entityConfig } from './ppsl-cd-lexical-shared/src/editors/Entity/config.js'
import { $isEntityContainerNode } from './ppsl-cd-lexical-shared/src/editors/plugins/EntityContainer/node.js'
import { $isEntityImageNode, EntityImageNode } from './ppsl-cd-lexical-shared/src/editors/plugins/EntityImage/node.js'
import { $isEntityShortDescriptionNode } from './ppsl-cd-lexical-shared/src/editors/plugins/EntityShortDescription/node.js'
import { $isEntityLongDescriptionNode } from './ppsl-cd-lexical-shared/src/editors/plugins/EntityLongDescription/node.js'
import { EntityMentionNode } from './ppsl-cd-lexical-shared/src/editors/plugins/EntityMention/node.js'
import { getIfImageIsNSFW } from '../wikimedia-commons/nsfwFilter.controller.js'

const {
  $getRoot,
  $isElementNode,
  $createParagraphNode,
  $isParagraphNode,
  ParagraphNode,
  $nodesOfType
} = lexical
const { createHeadlessEditor } = lexicalHeadless

/**
 * @param {import('lexical').LexicalEditor} editor
 * @param {import('lexical').LexicalNode} node
 */
const sanitizeNode = (editor, node) => {
  if ($isElementNode(node)) {
    const children = node.getChildren()
    for (const child of children) {
      sanitizeNode(child)
    }
  }
}

/**
 * @param {import('lexical').LexicalEditor} editor
 * @param {import('lexical').LexicalNode} node
 */
const onlyTextNodes = (editor, children) => {
  for (let index = 0; index < children.length; index++) {
    const node = children[index]
    if ($isElementNode(node) && !$isParagraphNode(node)) {
      if (node.getChildrenSize() > 1) {
        onlyTextNodes(editor, node.getChildren())
      }

      node.replace($createParagraphNode(), true)
    }
  }
}

export async function bioEditorValidation (stringifiedJSON) {
  const theme = { ...defaultTheme, ...readOnlyTheme }
  const config = bioConfig(theme, undefined, (error) => {
    console.error(error)
  })
  const bioEditor = createHeadlessEditor(config)

  const nextEditorState = bioEditor.parseEditorState(stringifiedJSON)

  bioEditor.setEditorState(nextEditorState)

  bioEditor.registerNodeTransform(ParagraphNode, (node) => {
    const parent = node.getParent()

    if (parent instanceof ParagraphNode) {
      const children = node.getChildren()
      parent.append(...children)

      node.remove() // Removing makes sure that this transform doesn't run again and creating an infinite loop.
    }
  })

  bioEditor.update(() => {
    const root = $getRoot()
    sanitizeNode(bioEditor, root)
  }, { discrete: true })
  await Promise.resolve().then()

  return stringifiedJSON === JSON.stringify(bioEditor.getEditorState().toJSON())
}

function validateEntityEditor (stringifiedJSON) {
  return new Promise((resolve, reject) => {
    const theme = { ...defaultTheme, ...readOnlyTheme }
    const config = entityConfig(theme, undefined, (error) => {
      console.error(error)
      reject(error)
    })

    const entityEditor = createHeadlessEditor(config)

    const nextEditorState = entityEditor.parseEditorState(stringifiedJSON)
    entityEditor.setEditorState(nextEditorState)

    entityEditor.update(() => {
      const root = $getRoot()
      sanitizeNode(entityEditor, root)

      // Make sure last child is entity-container
      /**
       * @type {lexical.ElementNode}
       */
      const entityContainer = root.getLastChild()
      if (!$isEntityContainerNode(entityContainer)) {
        throw new Error(`First child is "${entityContainer.getType()}" and not "entity-container".`)
      }

      // Make sure root only has one child.
      if (root.getChildrenSize() > 1) {
        throw new Error('Root has too many children.')
      }
        
      // Make sure first child of entity-container is entity-image
      /**
       * @type {EntityImageNode}
       */
      const entityImage = entityContainer.getFirstChild()
      if (!$isEntityImageNode(entityImage)) {
        throw new Error(`First child of "entity-container" is "${entityImage.getType()}" and not "entity-image".`)
      }

      // Make sure second child of entity-container is entity-short-description
      const entityShortDescription = entityContainer.getChildAtIndex(1)
      if (!$isEntityShortDescriptionNode(entityShortDescription)) {
        throw new Error(`Second child of "entity-container" is "${entityImage.getType()}" and not "entity-short-description".`)
      }

      onlyTextNodes(entityEditor, entityShortDescription.getChildren())

      // Make sure last child of entity-container is entity-long-description
      const entityLongDescription = entityContainer.getLastChild()
      if (!$isEntityLongDescriptionNode(entityLongDescription)) {
        throw new Error(`Last child of "entity-container" is "${entityImage.getType()}" and not "entity-long-description".`)
      }

      // Make sure the inserted image is not NSFW
      const entityNSFWImageURL = new URL(entityImage.getSrc())
      const fileName = `File:${entityNSFWImageURL.pathname.split('/').pop().replace(/_/g, ' ')}`
      const request = {query:{image:fileName}}
      if (getIfImageIsNSFW(request, null)) {
        throw new Error(`Entity Image is NSFW "${entityImage.getSrc()}".`)
      }

      onlyTextNodes(entityEditor, entityLongDescription.getChildren())

      resolve(entityEditor)
    })
  })
}

export async function entityEditorValidation (stringifiedJSON) {
  try {
    const entityEditor = await validateEntityEditor(stringifiedJSON)
    const res = JSON.stringify(entityEditor.getEditorState().toJSON())
    return { result: stringifiedJSON === res }
  } catch (error) {
    return { result: false, error: error.message }
  }
}

function entityMentions (stringifiedJSON) {
  return new Promise((resolve, reject) => {
    const config = entityConfig({}, undefined, (error) => {
      console.error(error)
      reject(error)
    })

    const entityEditor = createHeadlessEditor(config)

    const nextEditorState = entityEditor.parseEditorState(stringifiedJSON)
    entityEditor.setEditorState(nextEditorState)

    entityEditor.update(() => {
      const entityMentions = $nodesOfType(EntityMentionNode)

      const postIds = entityMentions.map((node) => node.getPostId())

      resolve(postIds)
    })
  })
}

export async function getEntityMentions (stringifiedJSON) {
  return await entityMentions(stringifiedJSON)
}
