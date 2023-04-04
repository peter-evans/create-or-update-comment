import * as core from '@actions/core'
import {Inputs, createOrUpdateComment} from './create-or-update-comment'
import {existsSync, readFileSync} from 'fs'
import {inspect} from 'util'
import * as utils from './utils'

function getBody(inputs: Inputs) {
  if (inputs.body) {
    return inputs.body
  } else if (inputs.bodyPath) {
    return readFileSync(inputs.bodyPath, 'utf-8')
  } else {
    return ''
  }
}

async function run(): Promise<void> {
  try {
    const inputs: Inputs = {
      token: core.getInput('token'),
      repository: core.getInput('repository'),
      issueNumber: Number(core.getInput('issue-number')),
      commentId: Number(core.getInput('comment-id')),
      body: core.getInput('body'),
      bodyPath: core.getInput('body-path') || core.getInput('body-file'),
      editMode: core.getInput('edit-mode'),
      appendSeparator: core.getInput('append-separator'),
      reactions: utils.getInputAsArray('reactions'),
      reactionsEditMode: core.getInput('reactions-edit-mode')
    }
    core.debug(`Inputs: ${inspect(inputs)}`)

    if (!['append', 'replace'].includes(inputs.editMode)) {
      throw new Error(`Invalid edit-mode '${inputs.editMode}'.`)
    }

    if (!['append', 'replace'].includes(inputs.reactionsEditMode)) {
      throw new Error(
        `Invalid reactions edit-mode '${inputs.reactionsEditMode}'.`
      )
    }

    if (!['newline', 'space', 'none'].includes(inputs.appendSeparator)) {
      throw new Error(`Invalid append-separator '${inputs.appendSeparator}'.`)
    }

    if (inputs.bodyPath && inputs.body) {
      throw new Error("Only one of 'body' or 'body-path' can be set.")
    }

    if (inputs.bodyPath) {
      if (!existsSync(inputs.bodyPath)) {
        throw new Error(`File '${inputs.bodyPath}' does not exist.`)
      }
    }

    const body = getBody(inputs)

    if (inputs.commentId) {
      if (!body && !inputs.reactions) {
        throw new Error("Missing comment 'body', 'body-path', or 'reactions'.")
      }
    } else if (inputs.issueNumber) {
      if (!body) {
        throw new Error("Missing comment 'body' or 'body-path'.")
      }
    } else {
      throw new Error("Missing either 'issue-number' or 'comment-id'.")
    }

    createOrUpdateComment(inputs, body)
  } catch (error) {
    core.debug(inspect(error))
    const errMsg = utils.getErrorMessage(error)
    core.setFailed(errMsg)
    if (errMsg == 'Resource not accessible by integration') {
      core.error(`See this action's readme for details about this error`)
    }
  }
}

run()
