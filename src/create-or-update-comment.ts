import * as core from '@actions/core'
import * as github from '@actions/github'
import * as utils from './utils'
import {inspect} from 'util'

export interface Inputs {
  token: string
  repository: string
  issueNumber: number
  commentId: number
  body: string
  bodyPath: string
  editMode: string
  appendSeparator: string
  reactions: string[]
  reactionsEditMode: string
}

const REACTION_TYPES = [
  '+1',
  '-1',
  'laugh',
  'confused',
  'heart',
  'hooray',
  'rocket',
  'eyes'
]

function getReactionsSet(reactions: string[]): string[] {
  const reactionsSet = [
    ...new Set(
      reactions.filter(item => {
        if (!REACTION_TYPES.includes(item)) {
          core.warning(`Skipping invalid reaction '${item}'.`)
          return false
        }
        return true
      })
    )
  ]
  if (!reactionsSet) {
    throw new Error(`No valid reactions are contained in '${reactions}'.`)
  }
  return reactionsSet
}

async function addReactions(
  octokit,
  owner: string,
  repo: string,
  commentId: number,
  reactions: string[]
) {
  const results = await Promise.allSettled(
    reactions.map(async reaction => {
      await octokit.rest.reactions.createForIssueComment({
        owner: owner,
        repo: repo,
        comment_id: commentId,
        content: reaction
      })
      core.info(`Setting '${reaction}' reaction on comment.`)
    })
  )
  for (let i = 0, l = results.length; i < l; i++) {
    if (results[i].status === 'fulfilled') {
      core.info(
        `Added reaction '${reactions[i]}' to comment id '${commentId}'.`
      )
    } else if (results[i].status === 'rejected') {
      core.warning(
        `Adding reaction '${reactions[i]}' to comment id '${commentId}' failed.`
      )
    }
  }
}

async function removeReactions(
  octokit,
  owner: string,
  repo: string,
  commentId: number,
  reactions: Reaction[]
) {
  const results = await Promise.allSettled(
    reactions.map(async reaction => {
      await octokit.rest.reactions.deleteForIssueComment({
        owner: owner,
        repo: repo,
        comment_id: commentId,
        reaction_id: reaction.id
      })
      core.info(`Removing '${reaction.content}' reaction from comment.`)
    })
  )
  for (let i = 0, l = results.length; i < l; i++) {
    if (results[i].status === 'fulfilled') {
      core.info(
        `Removed reaction '${reactions[i].content}' from comment id '${commentId}'.`
      )
    } else if (results[i].status === 'rejected') {
      core.warning(
        `Removing reaction '${reactions[i].content}' from comment id '${commentId}' failed.`
      )
    }
  }
}

function appendSeparatorTo(body: string, separator: string): string {
  switch (separator) {
    case 'newline':
      return body + '\n'
    case 'space':
      return body + ' '
    default: // none
      return body
  }
}

function truncateBody(body: string) {
  // 65536 characters is the maximum allowed for issue comments.
  const truncateWarning = '...*[Comment body truncated]*'
  if (body.length > 65536) {
    core.warning(`Comment body is too long. Truncating to 65536 characters.`)
    return body.substring(0, 65536 - truncateWarning.length) + truncateWarning
  }
  return body
}

async function createComment(
  octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<number> {
  body = truncateBody(body)

  const {data: comment} = await octokit.rest.issues.createComment({
    owner: owner,
    repo: repo,
    issue_number: issueNumber,
    body
  })
  core.info(`Created comment id '${comment.id}' on issue '${issueNumber}'.`)
  return comment.id
}

async function updateComment(
  octokit,
  owner: string,
  repo: string,
  commentId: number,
  body: string,
  editMode: string,
  appendSeparator: string
): Promise<number> {
  if (body) {
    let commentBody = ''
    if (editMode == 'append') {
      // Get the comment body
      const {data: comment} = await octokit.rest.issues.getComment({
        owner: owner,
        repo: repo,
        comment_id: commentId
      })
      commentBody = appendSeparatorTo(
        comment.body ? comment.body : '',
        appendSeparator
      )
    }
    commentBody = truncateBody(commentBody + body)
    core.debug(`Comment body: ${commentBody}`)
    await octokit.rest.issues.updateComment({
      owner: owner,
      repo: repo,
      comment_id: commentId,
      body: commentBody
    })
    core.info(`Updated comment id '${commentId}'.`)
  }
  return commentId
}

async function getAuthenticatedUser(octokit): Promise<string> {
  try {
    const {data: user} = await octokit.rest.users.getAuthenticated()
    return user.login
  } catch (error) {
    if (
      utils
        .getErrorMessage(error)
        .includes('Resource not accessible by integration')
    ) {
      // In this case we can assume the token is the default GITHUB_TOKEN and
      // therefore the user is 'github-actions[bot]'.
      return 'github-actions[bot]'
    } else {
      throw error
    }
  }
}

type Reaction = {
  id: number
  content: string
}

async function getCommentReactionsForUser(
  octokit,
  owner: string,
  repo: string,
  commentId: number,
  user: string
): Promise<Reaction[]> {
  const userReactions: Reaction[] = []
  for await (const {data: reactions} of octokit.paginate.iterator(
    octokit.rest.reactions.listForIssueComment,
    {
      owner,
      repo,
      comment_id: commentId,
      per_page: 100
    }
  )) {
    const filteredReactions: Reaction[] = reactions
      .filter(reaction => reaction.user.login === user)
      .map(reaction => {
        return {id: reaction.id, content: reaction.content}
      })
    userReactions.push(...filteredReactions)
  }
  return userReactions
}

export async function createOrUpdateComment(
  inputs: Inputs,
  body: string
): Promise<void> {
  const [owner, repo] = inputs.repository.split('/')

  const octokit = github.getOctokit(inputs.token)

  const commentId = inputs.commentId
    ? await updateComment(
        octokit,
        owner,
        repo,
        inputs.commentId,
        body,
        inputs.editMode,
        inputs.appendSeparator
      )
    : await createComment(octokit, owner, repo, inputs.issueNumber, body)

  core.setOutput('comment-id', commentId)

  if (inputs.reactions) {
    const reactionsSet = getReactionsSet(inputs.reactions)

    // Remove reactions if reactionsEditMode is 'replace'
    if (inputs.commentId && inputs.reactionsEditMode === 'replace') {
      const authenticatedUser = await getAuthenticatedUser(octokit)
      const userReactions = await getCommentReactionsForUser(
        octokit,
        owner,
        repo,
        commentId,
        authenticatedUser
      )
      core.debug(inspect(userReactions))

      const reactionsToRemove = userReactions.filter(
        reaction => !reactionsSet.includes(reaction.content)
      )
      await removeReactions(octokit, owner, repo, commentId, reactionsToRemove)
    }

    await addReactions(octokit, owner, repo, commentId, reactionsSet)
  }
}
