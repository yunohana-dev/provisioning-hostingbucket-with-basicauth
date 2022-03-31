import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_iam as iam,
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_s3 as s3,
} from 'aws-cdk-lib';
import * as crypto from 'crypto';
import * as environment from '../lib/environment';

export class ProvisioningHostingbucketWithBasicauthStack extends Stack {
  constructor(scope: Construct, id: string, env: environment.Environments, props?: StackProps) {
    super(scope, id, props);
    const vars = environment.variablesOf(env);
    const suffix = !!vars.stackName ? vars.stackName.toLowerCase() : env.toLowerCase();
    const refererStr = generateRandomString();

    // retrieve hostedZone
    const hostedZone = !!vars.domain ? route53.HostedZone.fromHostedZoneAttributes(this, 'existingHostedZone', {
      zoneName: vars.domain.hostedZoneName,
      hostedZoneId: vars.domain.hostedZoneId,
    }) : undefined;
    const domainNames = !!vars.domain ? [`${vars.domain.hostname}.${vars.domain.hostedZoneName}`] : undefined;
    const certificate = !!vars.domain && !!hostedZone ? new acm.DnsValidatedCertificate(this, `Cert`, {
      domainName: `${vars.domain.hostname}.${vars.domain.hostedZoneName}`,
      hostedZone: hostedZone,
      region: 'us-east-1',
    }) : undefined;
    const viewerCert = !!vars.domain && !!certificate ? cloudfront.ViewerCertificate.fromAcmCertificate(certificate, {
      aliases: [`${vars.domain.hostname}.${vars.domain.hostedZoneName}`]
    }) : undefined;

    // s3
    const bucket = new s3.Bucket(this, 'HostingBucket', {
      bucketName: `hostingbucket-${suffix}`,
      accessControl: s3.BucketAccessControl.PUBLIC_READ,
      publicReadAccess: true,
      websiteIndexDocument: 'index.html',
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    if (!!vars.domain) {
      const bucketPolicy = new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: ['s3:GetObject'],
        principals: [new iam.ArnPrincipal('*')],
        resources: [
          bucket.bucketArn + '/*'
        ],
        conditions: {
          'StringNotLike': {
            'aws:Referer': [refererStr]
          },
        }
      });
      bucket.addToResourcePolicy(bucketPolicy)
    }
    // cloudfront function: basic authorization
    const authHandler = new cloudfront.Function(this, 'BasicAuthHandler', {
      functionName: `BasicAuthHandler-${suffix}`,
      code: cloudfront.FunctionCode.fromFile({ filePath: "lib/lambda/basicauth.js", }),
    });
    // Cloudfront distribution
    const dist = new cloudfront.Distribution(this, `HostingBucketDist`, {
      comment: vars.stackName || 'HostingBucketDist',
      domainNames,
      certificate,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        origin: new origins.S3Origin(bucket, {
          customHeaders: {
            'Referer': refererStr
          }
        }),
        functionAssociations: [
          {
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            function: authHandler,
          },
        ],
      },
      enableLogging: true,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
    });

    const record = !!vars.domain && !!hostedZone ? new route53.ARecord(this, `DistRecord`, {
      recordName: `${vars.domain.hostname}.${vars.domain.hostedZoneName}`,
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(dist)),
      ttl: Duration.seconds(300),
    }) : undefined;

    const output = new CfnOutput(this, 'DistCustomHeader', {
      value: refererStr,
    });
  }
}

const generateRandomString = (): string => {
  return crypto.randomBytes(16).toString('base64').substring(0, 16)
}
