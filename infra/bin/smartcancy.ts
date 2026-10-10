#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { SmartCancyStack } from '../lib/smartcancy-stack.js';

const app = new App();
new SmartCancyStack(app, 'SmartCancyStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-southeast-2',
  },
});
