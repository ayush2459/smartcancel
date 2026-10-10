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
- The initial deployment attempts exposed Cognito Lite configuration limits and
  an AWS account-verification block on CloudFront. The failed stacks and their
  verified-empty retained Cognito user pools were removed. The current design
  avoids CloudFront, serving the private S3-hosted SPA through API Gateway and
  Lambda; it has not yet been deployed. No RDS instance is running.
- The Launch with AWS migration service sign-in did not complete. This plan is
  prepared locally; the repository has not been uploaded to that service.
- The app remains a prototype. Execution is simulation-only, and the database
  bootstrap uses synthetic demo data.

## Proposed first deployment

The local CDK app defines this architecture. It does not run migrations
automatically and does not create resources until an explicit deployment command
is run:

1. **Frontend** - private S3 bucket stores the built SPA. API Gateway serves the
   site over its HTTPS endpoint through a small Lambda that reads S3 objects and
   returns `/runtime-config.json` dynamically. This avoids CloudFront account
   verification and keeps the browser and API on one origin.
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

The site and API share the API Gateway origin, so browser API calls need no
permissive CORS rule. The local app remains unauthenticated unless local Cognito
variables are configured; production `/api` routes are protected by API Gateway,
not by frontend-only checks. Unmatched SPA paths are served from `index.html`.

## Cost and Free plan gate

The account currently displays USD $100 in promotional credits and says it is on
the Free plan. Credits are not a per-service guarantee and do not mean that every
AWS service is available on that plan. Availability, eligible usage, and terms
must be checked in the account before creating resources. Do not upgrade the plan
to work around a service restriction without an explicit decision.

The largest recurring cost is the PostgreSQL database, which runs while
provisioned even when nobody is using the app. Storage, backups, the generated
Secrets Manager secret, API Gateway requests/egress, frontend and API Lambda
invocations, S3 reads, Cognito, and CloudWatch can also contribute to cost. Avoid
NAT Gateway, CloudFront, Application Load Balancer, and always-on Fargate here.

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

The previous **USD $22.70/month** low-traffic estimate included CloudFront and
does not apply to the current API Gateway/Lambda frontend. The **USD $21.41**
database/storage/secret baseline is unchanged; static-file requests now add API
Gateway, Lambda, S3-read, and data-transfer usage. Recalculate the complete
scenario in the [AWS Pricing Calculator](https://calculator.aws/) using expected
page loads and API traffic before provisioning. Neither the estimate nor a
spending alert is a hard cap.

The account's Free Tier API reports the **Free** plan as active with **USD $100**
credits remaining through **April 10, 2027**, and no recorded Free Tier usage yet.
The official [AWS Free Tier page](https://aws.amazon.com/free/) says a
Free plan account closes when credits run out or the six-month period ends,
unless converted to Paid. Do not assume the app will remain online for the
whole credit period. The Free Tier usage API does not guarantee that every
required service is eligible or usable on this specific account.

You chose 24/7 database availability. The fixed baseline alone is about
**USD $21.41/month**, before the variable hosting costs above. An alert is not a
cap, and it has not been verified as configured. Confirm service availability,
remaining credits, and the revised estimate before deploying.

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
4. The first application deployment uses the default callback
   `http://localhost:3000/`. After the stack outputs `FrontendUrl`, run `cdk diff`
   with `-c cognitoCallbackUrl=<FrontendUrl>/` and review it. Public hosted
   sign-in will not work until this callback update is separately deployed.
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
