import * as core from '@actions/core'
import * as github from '@actions/github'

export interface Inputs {
  token: string
  repository: string
  issueNumber: number
  commentId: number
  body: string
  bodyFile: string
  editMode: string
  appendSeparator: string
  reactions: string[]
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
    reactions.map(async item => {
      await octokit.rest.reactions.createForIssueComment({
        owner: owner,
        repo: repo,
        comment_id: commentId,
        content: item
      })
      core.info(`Setting '${item}' reaction on comment.`)
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

async function createComment(
  octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<number> {
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
    commentBody = commentBody + body
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
  const {data: user} = await octokit.rest.users.getAuthenticated()
  return user.login
}

async function getCommentReactionsForUser(
  octokit,
  owner: string,
  repo: string,
  commentId: number,
  user: string
): Promise<string[]> {
  const userReactions: any[] = []
  for await (const {data: reactions} of octokit.paginate.iterator(
    octokit.rest.reactions.listForIssueComment,
    {
      owner,
      repo,
      comment_id: commentId,
      per_page: 100
    }
  )) {
    const filteredReactions = reactions.filter(
      reaction => reaction.user.login === user
    )
    core.debug(`Filtered reactions: ${filteredReactions}`)
    userReactions.push(...filteredReactions)
  }
  return userReactions.map(reaction => reaction.content)
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

    // If inputs.commentId && edit-mode=replace
    // const authenticatedUser = await getAuthenticatedUser(octokit)
    // If the current token == 'GITHUB_TOKEN' then the authenticated user is 'github-actions[bot]'
    const authenticatedUser = 'github-actions[bot]'
    const userReactions = await getCommentReactionsForUser(
      octokit,
      owner,
      repo,
      commentId,
      authenticatedUser
    )
    core.debug(`User reactions: ${userReactions}`)

    await addReactions(octokit, owner, repo, commentId, reactionsSet)
  }
}
