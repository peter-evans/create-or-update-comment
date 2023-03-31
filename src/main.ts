import * as core from '@actions/core'
import {Inputs, createOrUpdateComment} from './create-or-update-comment'
import {existsSync} from 'fs'
import {inspect} from 'util'
import * as utils from './utils'

async function run(): Promise<void> {
  try {
    const inputs: Inputs = {
      token: core.getInput('token'),
      repository: core.getInput('repository'),
      issueNumber: Number(core.getInput('issue-number')),
      commentId: Number(core.getInput('comment-id')),
      body: core.getInput('body'),
      bodyFile: core.getInput('body-file'),
      editMode: core.getInput('edit-mode'),
      appendSeparator: core.getInput('append-separator'),
      reactions: utils.getInputAsArray('reactions')
    }
    core.debug(`Inputs: ${inspect(inputs)}`)

    if (!['append', 'replace'].includes(inputs.editMode)) {
      core.setFailed(`Invalid edit-mode '${inputs.editMode}'.`)
      return
    }

    if (!['newline', 'space', 'none'].includes(inputs.appendSeparator)) {
      core.setFailed(`Invalid append-separator '${inputs.appendSeparator}'.`)
      return
    }

    if (inputs.bodyFile && inputs.body) {
      core.setFailed("Only one of 'body' or 'body-file' can be set.")
      return
    }

    if (inputs.bodyFile) {
      if (!existsSync(inputs.bodyFile)) {
        core.setFailed(`File '${inputs.bodyFile}' does not exist.`)
        return
      }
    }

    createOrUpdateComment(inputs)
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
