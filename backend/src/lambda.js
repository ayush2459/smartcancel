import serverlessExpress from '@vendia/serverless-express';
import { app } from './server.js';

const server = serverlessExpress({ app });

export async function handler(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  return server(event, context);
}
