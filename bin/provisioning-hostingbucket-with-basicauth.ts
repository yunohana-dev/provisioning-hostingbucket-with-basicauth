#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProvisioningHostingbucketWithBasicauthStack } from '../lib/provisioning-hostingbucket-with-basicauth-stack';

import * as environment from '../lib/environment';


const
  app = new cdk.App(),
  env: environment.Environments = app.node.tryGetContext('env') as environment.Environments,
  vars = environment.variablesOf(env);
if (!env || !vars) throw new Error('Invalid environment name.');

new ProvisioningHostingbucketWithBasicauthStack(app,
  vars.stackName || `HostingbucketWithBasicauth-${env}`,
  env, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: vars.region || process.env.CDK_DEFAULT_REGION,
  },
});
