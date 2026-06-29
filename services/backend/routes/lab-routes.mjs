import { buildResultDossierFromRunnerResult, createLabRunnerAdapter } from '../lib/lab-runner.mjs';
import { parseReproductionCommandString } from '../lib/lab-runner-safety.mjs';

function parseExperimentRunExecuteRoute(requestPath) {
  const match = requestPath.match(/^\/api\/projects\/([^/]+)\/experiment-runs\/([^/]+)\/execute$/);
  if (!match) {
    return null;
  }

  return {
    projectId: decodeURIComponent(match[1]),
    runId: decodeURIComponent(match[2]),
  };
}

function commandFromBody(body = {}) {
  if (body.command && typeof body.command === 'object' && !Array.isArray(body.command)) {
    return body.command;
  }

  return null;
}

function commandFromReproductionPlan(reproductionPlan = null) {
  const commandText = Array.isArray(reproductionPlan?.commands) ? reproductionPlan.commands.find(Boolean) : '';
  if (!commandText) {
    return null;
  }

  const command = parseReproductionCommandString(commandText);
  if (Array.isArray(reproductionPlan.metrics) && reproductionPlan.metrics.length > 0) {
    return {
      ...command,
      expectedMetrics: reproductionPlan.metrics,
    };
  }
  return command;
}

function runStatusFromRunnerResult(result = {}) {
  if (result.status === 'done') {
    return 'done';
  }
  if (result.status === 'blocked') {
    return 'draft';
  }
  return 'error';
}

function shouldCreateDossier(result = {}) {
  return result.status !== 'blocked' || result.failure?.type !== 'approval_required';
}

export function createLabRoutes({
  json,
  notFound,
  readJsonBody,
  requireProjectAccess,
  rootDir,
  sendError,
  store,
}) {
  const runner = createLabRunnerAdapter({ rootDir });

  return async function handleLabRoute(request, response, { requestPath }) {
    const executeRoute = parseExperimentRunExecuteRoute(requestPath);
    if (request.method !== 'POST' || !executeRoute) {
      return false;
    }

    const access = requireProjectAccess(request, response, executeRoute.projectId, 'write');
    if (!access) {
      return true;
    }

    const run = store.getProjectAsset('experimentRuns', executeRoute.runId);
    if (!run || run.projectId !== executeRoute.projectId) {
      notFound(response);
      return true;
    }

    try {
      const body = await readJsonBody(request);
      const reproductionPlan = run.reproductionPlanId
        ? store.getProjectAsset('reproductionPlans', run.reproductionPlanId)
        : null;
      const command = commandFromBody(body) || commandFromReproductionPlan(reproductionPlan);
      if (!command) {
        sendError(response, new Error('Structured runner command or linked reproduction plan command is required.'), 400);
        return true;
      }

      const startedAt = new Date().toISOString();
      await store.upsertProjectAsset('experimentRuns', {
        ...run,
        config: {
          ...(run.config || {}),
          command,
        },
        startedAt: run.startedAt || startedAt,
        status: 'running',
        updatedAt: startedAt,
      });

      const runnerResult = await runner.run(command, {
        approval: body.approval,
      });
      const completedAt = new Date().toISOString();
      const updatedRun = await store.upsertProjectAsset('experimentRuns', {
        ...run,
        artifacts: runnerResult.artifacts || [],
        completedAt,
        config: {
          ...(run.config || {}),
          approval: runnerResult.approval,
          command: runnerResult.command || command,
          failure: runnerResult.failure || null,
          logs: runnerResult.logs || {},
          risk: runnerResult.risk || null,
        },
        metrics: runnerResult.metrics || {},
        startedAt: run.startedAt || startedAt,
        status: runStatusFromRunnerResult(runnerResult),
        updatedAt: completedAt,
      });

      let resultDossier = null;
      if (shouldCreateDossier(runnerResult)) {
        const dossierPayload = buildResultDossierFromRunnerResult({
          paperId: run.paperId || reproductionPlan?.paperId || '',
          questionId: run.questionId || reproductionPlan?.questionId || '',
          reproductionPlan: reproductionPlan || {},
          runId: updatedRun.id,
          runnerResult,
        });
        resultDossier = await store.upsertProjectAsset('resultDossiers', {
          ...dossierPayload,
          projectId: executeRoute.projectId,
          title: `${updatedRun.title || 'Experiment run'} result`,
        });
      }

      const audit =
        typeof store.recordAuditEvent === 'function'
          ? await store.recordAuditEvent({
              action: 'executeExperimentRun',
              actorUserId: access.user.id,
              metadata: {
                approvalState: runnerResult.approval?.state || '',
                runnerStatus: runnerResult.status,
              },
              projectId: executeRoute.projectId,
              reason: String(body.reason || 'Experiment run executed.'),
              targetId: updatedRun.id,
              targetType: 'experimentRuns',
            })
          : null;

      json(response, 200, {
        audit,
        experimentRun: updatedRun,
        resultDossier,
        runnerResult,
      });
    } catch (error) {
      sendError(response, error, 409);
    }

    return true;
  };
}
