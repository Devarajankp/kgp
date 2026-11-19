import {createApiApp} from '../server/apiRouter.ts';

const app = createApiApp({serverless: true});

export default app;
