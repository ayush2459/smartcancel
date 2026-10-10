import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export class SmartCancyStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const callbackUrl = this.node.tryGetContext('cognitoCallbackUrl') ?? 'http://localhost:3000/';
    const callbackOrigin = new URL(callbackUrl).origin;
    const callback = `${callbackOrigin}/`;
    const domainPrefix = this.node.tryGetContext('cognitoDomainPrefix')
      ?? `smartcancy-demo-${this.account}`;

    const userPool = new cognito.UserPool(this, 'Users', {
      userPoolName: 'smartcancy-demo-users',
      featurePlan: cognito.FeaturePlan.LITE,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(3),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const hostedDomain = userPool.addDomain('HostedLogin', {
      cognitoDomain: { domainPrefix },
    });
    const userPoolClient = userPool.addClient('WebAppClient', {
      userPoolClientName: 'smartcancy-web',
      generateSecret: false,
      preventUserExistenceErrors: true,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [callback],
        logoutUrls: [callback],
      },
      accessTokenValidity: Duration.minutes(15),
      idTokenValidity: Duration.minutes(15),
      refreshTokenValidity: Duration.days(1),
      enableTokenRevocation: true,
    });

    const vpc = new ec2.Vpc(this, 'ApplicationVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    const databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc,
      description: 'Allow PostgreSQL only from the SmartCancy API Lambda.',
      allowAllOutbound: false,
    });
    const apiSecurityGroup = new ec2.SecurityGroup(this, 'ApiLambdaSecurityGroup', {
      vpc,
      description: 'SmartCancy API Lambda database egress.',
      allowAllOutbound: false,
    });
    apiSecurityGroup.addEgressRule(databaseSecurityGroup, ec2.Port.tcp(5432));
    databaseSecurityGroup.addIngressRule(apiSecurityGroup, ec2.Port.tcp(5432));

    const database = new rds.DatabaseInstance(this, 'Postgres', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [databaseSecurityGroup],
      databaseName: 'smartcancy',
      credentials: rds.Credentials.fromGeneratedSecret('smartcancy_app'),
      allocatedStorage: 20,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      publiclyAccessible: false,
      multiAz: false,
      backupRetention: Duration.days(1),
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoMinorVersionUpgrade: true,
    });
    const databaseSecret = database.secret;
    if (!databaseSecret) throw new Error('RDS did not provide its generated database secret.');

    const apiFunctionLogs = new logs.LogGroup(this, 'ApiFunctionLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const migrationFunctionLogs = new logs.LogGroup(this, 'DatabaseBootstrapFunctionLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const apiFunction = new nodejs.NodejsFunction(this, 'ApiFunction', {
      entry: path.join(projectRoot, 'backend', 'src', 'lambda.js'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      depsLockFilePath: path.join(projectRoot, 'backend', 'package-lock.json'),
      timeout: Duration.seconds(28),
      memorySize: 512,
      logGroup: apiFunctionLogs,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [apiSecurityGroup],
      environment: {
        DB_HOST: database.instanceEndpoint.hostname,
        DB_PORT: '5432',
        DB_NAME: 'smartcancy',
        DB_USER: 'smartcancy_app',
        DB_PASSWORD: databaseSecret.secretValueFromJson('password').unsafeUnwrap(),
        DB_POOL_MAX: '2',
        DB_SSL: 'true',
        SMARTCANCY_ALLOW_DEMO_MODE: 'false',
      },
      bundling: {
        format: nodejs.OutputFormat.ESM,
        minify: true,
        sourceMap: false,
      },
    });
    const databaseFiles = new lambda.LayerVersion(this, 'DatabaseBootstrapFiles', {
      code: lambda.Code.fromAsset(path.join(projectRoot, 'database')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_22_X],
      description: 'Schema and synthetic demonstration seed for a new SmartCancy database.',
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const migrationFunction = new nodejs.NodejsFunction(this, 'DatabaseBootstrapFunction', {
      entry: path.join(projectRoot, 'backend', 'src', 'migrate.js'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      depsLockFilePath: path.join(projectRoot, 'backend', 'package-lock.json'),
      timeout: Duration.minutes(5),
      memorySize: 256,
      logGroup: migrationFunctionLogs,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [apiSecurityGroup],
      layers: [databaseFiles],
      environment: {
        DB_HOST: database.instanceEndpoint.hostname,
        DB_PORT: '5432',
        DB_NAME: 'smartcancy',
        DB_USER: 'smartcancy_app',
        DB_PASSWORD: databaseSecret.secretValueFromJson('password').unsafeUnwrap(),
        DB_SSL: 'true',
      },
      bundling: {
        format: nodejs.OutputFormat.ESM,
        minify: true,
        sourceMap: false,
      },
    });

    const apiLogGroup = new logs.LogGroup(this, 'HttpApiAccessLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      apiName: 'smartcancy-api',
      createDefaultStage: false,
    });
    const integration = new HttpLambdaIntegration('ApiIntegration', apiFunction);
    const jwtAuthorizer = new HttpJwtAuthorizer(
      'CognitoJwtAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      { jwtAudience: [userPoolClient.userPoolClientId] },
    );

    httpApi.addRoutes({
      path: '/api/health/live',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
    });
    httpApi.addRoutes({
      path: '/api',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration,
      authorizer: jwtAuthorizer,
    });
    httpApi.addRoutes({
      path: '/api/{proxy+}',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration,
      authorizer: jwtAuthorizer,
    });
    const siteBucket = new s3.Bucket(this, 'FrontendBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const frontendFunctionLogs = new logs.LogGroup(this, 'FrontendFunctionLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const frontendFunction = new nodejs.NodejsFunction(this, 'FrontendFunction', {
      entry: path.join(projectRoot, 'backend', 'src', 'frontend.js'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      depsLockFilePath: path.join(projectRoot, 'backend', 'package-lock.json'),
      timeout: Duration.seconds(10),
      memorySize: 256,
      logGroup: frontendFunctionLogs,
      environment: {
        FRONTEND_BUCKET: siteBucket.bucketName,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        COGNITO_DOMAIN: `https://${hostedDomain.domainName}`,
      },
      bundling: {
        format: nodejs.OutputFormat.ESM,
        minify: true,
        sourceMap: false,
      },
    });
    siteBucket.grantRead(frontendFunction);
    const frontendIntegration = new HttpLambdaIntegration('FrontendIntegration', frontendFunction);
    httpApi.addRoutes({
      path: '/',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: frontendIntegration,
    });
    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: frontendIntegration,
    });
    new apigatewayv2.HttpStage(this, 'ApiDefaultStage', {
      httpApi,
      stageName: '$default',
      autoDeploy: true,
      accessLogSettings: {
        destination: new apigatewayv2.LogGroupLogDestination(apiLogGroup),
        format: apigateway.AccessLogFormat.custom(JSON.stringify({
          requestId: '$context.requestId',
          sourceIp: '$context.identity.sourceIp',
          requestTime: '$context.requestTime',
          routeKey: '$context.routeKey',
          status: '$context.status',
          responseLength: '$context.responseLength',
        })),
      },
    });
    new s3deploy.BucketDeployment(this, 'FrontendDeployment', {
      sources: [s3deploy.Source.asset(path.join(projectRoot, 'dist'))],
      destinationBucket: siteBucket,
    });

    new CfnOutput(this, 'FrontendUrl', {
      value: httpApi.apiEndpoint,
    });
    new CfnOutput(this, 'DatabaseEndpoint', {
      value: database.instanceEndpoint.hostname,
    });
    new CfnOutput(this, 'CognitoUserPoolId', {
      value: userPool.userPoolId,
    });
    new CfnOutput(this, 'CognitoAppClientId', {
      value: userPoolClient.userPoolClientId,
    });
    new CfnOutput(this, 'CognitoHostedUiDomain', {
      value: `https://${hostedDomain.domainName}`,
    });
    new CfnOutput(this, 'DatabaseBootstrapFunctionName', {
      value: migrationFunction.functionName,
    });
    new CfnOutput(this, 'ApiEndpoint', {
      value: httpApi.apiEndpoint,
    });
  }
}
