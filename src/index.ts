import { Application, Context } from "probot";
import metadata from "probot-metadata";

interface IRecordedFailure {
  readonly path: string;
  readonly message: string;
  readonly raw_details: string;
  readonly details_url: string;
}

interface IRecordedFailureMap {
  [sha: string]: IRecordedFailure[];
}

function editFailures(
  context: Context,
  pullNumbers: number[],
  headSha: string,
  cb: (before: IRecordedFailure[]) => Promise<boolean>,
): Promise<void[]> {
  const params = context.repo();

  return Promise.all(
    pullNumbers.map(async (pullNumber) => {
      const response = await context.github.issues.get({...params, number: pullNumber});
      const issueish = {
        ...params,
        ...response.data,
      };

      const fullMap: IRecordedFailureMap = (await metadata(context, issueish).get("failures")) || {};
      let failures = fullMap[headSha];
      if (!failures) {
        fullMap[headSha] = failures = [];
      }
      const changed = await cb(failures);
      if (changed) {
        await metadata(context, issueish).set("failures", fullMap);
      }
    }),
  );
}

export = (app: Application) => {
  app.on("check_run.completed", async (context) => {
    const run = context.payload.check_run;

    // Extract information from the payload

    const detailsUrl: string = run.details_url;
    const annotationsCount: number = run.output.annotations_count;
    const headSha: string = run.head_sha;
    const pullRequestNumbers: number[] = run.pull_requests.map((each: any) => each.number);

    // Short-circuit and log some common cases we don't care about

    if (pullRequestNumbers.length === 0) {
      context.log.debug(`ignoring check_run ${run.id} with no linked pull requests`);
      return;
    }

    if (annotationsCount === 0) {
      context.log.debug(`ignoring check_run ${run.id} with no annotations`);
      return;
    }

    if (annotationsCount > 5) {
      context.log.debug(`ignoring check_run ${run.id} with too many (${annotationsCount}) annotations`);
      return;
    }

    if (run.conclusion !== "failure" && run.conclusion !== "success") {
      context.log.debug(`ignoring check_run ${run.id} with conclusion ${run.conclusion}`);
      return;
    }

    // Fetch annotation data

    const {data: annotations} = await context.github.checks.listAnnotations(
      context.repo({check_run_id: run.id}),
    );
    const failures = annotations.filter((annotation) => annotation.annotation_level === "failure");

    if (failures.length === 0) {
      context.log.debug(`ignoring check_run ${run.id} with no failure annotations`);
      return;
    }

    // Detect flakes and take appropriate action

    if (run.conclusion === "failure") {
      context.log.debug(`check_run ${run.id} contains failures`);
      // Record this failure within the pull request metadata if it is not present already
      await editFailures(context, pullRequestNumbers, headSha, async (known) => {
        let newSeen = false;
        const knownPaths = new Set(known.map((each) => each.path));
        for (const annotation of failures) {
          if (!knownPaths.has(annotation.path)) {
            known.push({
              path: annotation.path,
              message: annotation.message,
              raw_details: annotation.raw_details,
              details_url: detailsUrl,
            });
            newSeen = true;
          }
        }

        return newSeen;
      });
    } else if (run.conclusion === "success") {
      //
    }
  });
};
