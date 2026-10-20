import type * as legacy from '@generaltranslation/api/legacy';
import type {
  AwaitJobsOptions,
  AwaitJobsResult,
  GetJobStatuses,
  JobResult,
  awaitJobs,
  pollJobs,
} from '../../api.js';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;

// generaltranslation/api keeps the 9.x signatures over the package's `export *`.
type _AwaitJobs = Expect<Equal<typeof awaitJobs, typeof legacy.awaitJobs>>;
type _PollJobs = Expect<Equal<typeof pollJobs, typeof legacy.pollJobs>>;
type _Options = Expect<Equal<AwaitJobsOptions, legacy.AwaitJobsOptions>>;
type _Result = Expect<Equal<AwaitJobsResult, legacy.AwaitJobsResult>>;
type _JobResult = Expect<Equal<JobResult, legacy.JobResult>>;
type _GetJobStatuses = Expect<Equal<GetJobStatuses, legacy.GetJobStatuses>>;

declare const awaitJobsAt9x: typeof awaitJobs;
declare const client: Parameters<typeof awaitJobs>[0];
// 9.x arity: (client, jobIds, options); no projectId.
void awaitJobsAt9x(client, ['job'], { timeoutSeconds: 1 });
