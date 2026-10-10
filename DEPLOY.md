# SmartCancy AWS deployment plan

This document describes the implemented deployment template and its review gates.
It does not provision AWS resources. Do not run bootstrap or deploy commands until
account eligibility, a complete monthly estimate, and the CloudFormation diff have
been reviewed and approved.

## Current deployment status

- AWS CLI profile: `smartcancy`
- Target region: `ap-southeast-2` (Asia Pacific - Sydney)
- AWS CLI authentication was verified locally with `aws sts get-caller-identity`.
- CDKToolkit has been bootstrapped in `ap-southeast-2`; it created the standard
  CDK asset bucket, ECR repository, IAM roles, and SSM parameter.
- The first SmartCancy application deployment failed because Cognito Lite does
  not support refresh-token rotation. The failed CloudFormation stack and its
  verified-empty retained Cognito user pool have been removed. The Cognito Lite
  client configuration is corrected, but no application resources are deployed.
- The Launch with AWS migration service sign-in did not complete. This plan is
  prepared locally; the repository has not been uploaded to that service.
- The app remains a prototype. Execution is simulation-only, and the database
  bootstrap uses synthetic demo data.

## Proposed first deployment

The local CDK app defines this architecture. It does not run migrations
automatically and does not create resources until an explicit deployment command
is run:

1. **Frontend** - private S3 bucket with CloudFront Origin Access Control. CloudFront
   routes `/api*` to API Gateway and serves `/runtime-config.json` without caching.
2. **Sign-in** - Cognito Lite User Pool, authorization-code flow with PKCE,
   no public sign-up, and a one-day refresh token. Lite does not support
   refresh-token rotation. The browser stores tokens in cookies. Lite is set
   explicitly because the default for a new pool is Essentials.
3. **API** - API Gateway HTTP API with a JWT authorizer on every `/api` route except
   `/api/health/live`. HTTP API is the lower-cost, lower-latency choice over REST API;
   the app does not need REST-only features such as API keys, built-in caching, or WAF.
   It invokes Express through the Lambda adapter.
4. **Database** - private, encrypted, single-AZ PostgreSQL RDS in isolated subnets
   spanning two Availability Zones (required for an RDS subnet group). The Lambda
   security group is the only allowed database client. No NAT Gateway is created.
   Single-AZ is a demo trade-off, not high availability.
5. **Credentials and logs** - RDS generates a Secrets Manager secret; CloudFormation
   injects its password as a Lambda environment value, encrypted at rest by Lambda.
   Lambda and API access logs are retained for one week. Database secret rotation
   requires updating the Lambda configuration.
6. **Database initialization** - a private, one-shot Lambda can apply the schema and
   synthetic seed to this new database. It is not invoked automatically.

The deployed site uses one browser origin, so API calls need no permissive CORS rule.
The local app remains unauthenticated unless local Cognito variables are configured;
the production API is protected by API Gateway, not by frontend-only checks.

## Cost and Free plan gate

The account currently displays USD $100 in promotional credits and says it is on
the Free plan. Credits are not a per-service guarantee and do not mean that every
AWS service is available on that plan. Availability, eligible usage, and terms
must be checked in the account before creating resources. Do not upgrade the plan
to work around a service restriction without an explicit decision.

The largest recurring cost is the PostgreSQL database, which runs while
provisioned even when nobody is using the app. Storage, backups, the generated
Secrets Manager secret, CloudFront requests/egress, API requests, Lambda, Cognito,
and CloudWatch can also contribute to cost. Avoid NAT Gateway, Application Load
Balancer, and always-on Fargate for this first demo.

### Known database compute price (Sydney)

The AWS Price List API returned **USD $0.025 per hour** for an on-demand
`db.t4g.micro`, PostgreSQL, Single-AZ RDS instance in Asia Pacific (Sydney),
effective October 1, 2026. At 730 hours/month this is **USD $18.25/month for
database compute alone**. The configured 20 GB gp3 volume is about **USD
$2.76/month**, and one Secrets Manager secret about **USD $0.40/month**. That is
a fixed baseline of **USD $21.41/month**, before backups beyond the included
allowance, traffic, logs, and the rest of the stack. Pricing sources:
[Amazon RDS for PostgreSQL pricing](https://aws.amazon.com/rds/postgresql/pricing/)
and the AWS Price List API (`AmazonRDS`, `ap-southeast-2`).

### Low-traffic planning scenario (not a quote or a cap)

Using published AWS Price List API on-demand rates and the monthly assumptions
below gives an illustrative total of **about USD $22.70/month**:

| Component | Monthly assumption | Estimate |
| --- | ---: | ---: |
| RDS PostgreSQL compute | `db.t4g.micro`, 730 hours | $18.25 |
| RDS gp3 storage | 20 GB | $2.76 |
| Secrets Manager | 1 secret | $0.40 |
| S3 Standard | 1 GB | $0.025 |
| CloudFront outbound data | 10 GB delivered in India | $1.09 |
| CloudFront HTTPS requests | 10,000 | $0.012 |
| API Gateway HTTP API | 10,000 requests | $0.0129 |
| Lambda | 10,000 requests, 0.5 GB, 1 second each | $0.0853 |
| CloudWatch Logs ingestion | 0.1 GB | $0.067 |
| Cognito Lite | 5 direct-sign-in monthly active users | $0.00 at [current first 10,000 MAU tier](https://aws.amazon.com/cognito/pricing/) |

The arithmetic was calculated by script. This is a low-usage demo scenario, not
a maximum: it excludes extra snapshots/backup storage, email/SMS, Cognito
advanced security, traffic beyond 10 GB, CloudFront price differences for other
viewer locations, and unusually high logs or API traffic. Confirm exact inputs
in the [AWS Pricing Calculator](https://calculator.aws/) before provisioning.
This estimate is not a spending cap.

The account's Free Tier API reports the **Free** plan as active with **USD $100**
credits remaining through **April 10, 2027**, and no recorded Free Tier usage yet.
At this scenario estimate, those credits would last about **4.40 months** if
there were no other AWS charges; compute alone would use them in about **5.48
months**. The official [AWS Free Tier page](https://aws.amazon.com/free/) says a
Free plan account closes when credits run out or the six-month period ends,
unless converted to Paid. Do not assume the app will remain online for the
whole credit period. The Free Tier usage API does not guarantee that every
required service is eligible or usable on this specific account.

You chose 24/7 database availability. The scenario is about **USD $2.30 below**
the previously discussed USD $25 monthly alert threshold, before omitted or
variable charges. An alert is not a cap, and it has not been verified as
configured. Confirm service availability and account eligibility before
bootstrapping or deploying.

Before provisioning:

1. Confirm service availability/eligibility for this Free plan. The plan-state
   and usage APIs confirm active Free status and credits but do not certify
   future eligibility for every service in the stack.
2. Confirm or adjust the low-traffic assumptions in the
   [AWS Pricing Calculator](https://calculator.aws/) and compare them with the
   remaining credits and expiry date.
3. Check current Free plan spending alerts and controls. Treat notifications as
   warnings, not a guaranteed hard spending cap.
4. If any required service is unavailable or the estimate is unacceptable,
   stop and choose a different plan before provisioning.

## Build, review, and deployment sequence

The following application-stack steps are still pending:

1. Build and synthesize locally with `npm run infra:synth`. This command builds
   the frontend and runs `cdk synth --strict`; it does not contact AWS to create
   resources.
2. Confirm the cost scenario and account Free plan/service eligibility before
   asking to bootstrap. The previous $25 alert is a notification, not a hard cap.
3. CDK bootstrap is already complete for `ap-southeast-2`; no other region was
   bootstrapped.
4. The first application deployment uses the default callback `http://localhost:3000/`.
   After the stack outputs `FrontendUrl`, run `cdk diff` with
   `-c cognitoCallbackUrl=https://<cloudfront-domain>/` and review it. The first
   deployment's public hosted sign-in will not work until this callback update
   is separately deployed.
5. Add invited demo users in Cognito; self-registration is disabled. Do not send
   the temporary password in chat.
6. Invoke `DatabaseBootstrapFunctionName` once with
   `{"action":"initialize"}` from the Lambda console to create the schema and
   apply synthetic demo rows. This is for the newly created, dedicated
   SmartCancy RDS database only. Never point it at FlowSense or another database.
7. Verify sign-in, authenticated API access, health checks, and five pilot
   reports. Confirm execution remains explicitly simulation-only.
8. Before teardown, export data only with approval. The CDK stack retains the
   RDS database and Cognito user pool to prevent accidental deletion; these
   retained resources continue to incur charges and require deliberate cleanup.

For CI/CD, use GitHub Actions OIDC with a narrowly scoped deployment role instead
of storing AWS access keys in GitHub secrets.
