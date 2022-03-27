import { Stack, StackProps, RemovalPolicy, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_iam as iam,
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_s3 as s3,
} from 'aws-cdk-lib';
import * as environment from '../lib/environment';

export class ProvisioningHostingbucketWithBasicauthStack extends Stack {
  constructor(scope: Construct, id: string, env: environment.Environments, props?: StackProps) {
    super(scope, id, props);
    const vars = environment.variablesOf(env);
    const suffix = !!vars.stackName ? vars.stackName.toLowerCase() : env.toLowerCase();

    // retrieve hostedZone
    const hostedZone = !!vars.domain ? route53.HostedZone.fromHostedZoneAttributes(this, 'existingHostedZone', {
      zoneName: vars.domain.hostedZoneName,
      hostedZoneId: vars.domain.hostedZoneId,
    }) : undefined;
    const cert = !!vars.domain && !!hostedZone ? new acm.DnsValidatedCertificate(this, `Cert`, {
      domainName: `${vars.domain.hostname}.${vars.domain.hostedZoneName}`,
      hostedZone: hostedZone,
      region: 'us-east-1',
    }) : undefined;
    const viewerCert = !!vars.domain && !!cert ? cloudfront.ViewerCertificate.fromAcmCertificate(cert, {
      aliases: [`${vars.domain.hostname}.${vars.domain.hostedZoneName}`]
    }) : undefined;

    // s3
    const bucket = new s3.Bucket(this, 'HostingBucket', {
      bucketName: `hostingbucket-${suffix}`,
      accessControl: s3.BucketAccessControl.PRIVATE,
      websiteIndexDocument: 'index.html',
      removalPolicy: RemovalPolicy.DESTROY,
    });
    // Origin Access Identity
    const oai = new cloudfront.OriginAccessIdentity(this, 'HostingBucketOai');
    const bucketPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject'],
      principals: [
        oai.grantPrincipal,
        // new iam.CanonicalUserPrincipal(oai.cloudFrontOriginAccessIdentityS3CanonicalUserId),
      ],
      resources: [`${bucket.bucketArn}/*`],
    });
    bucket.addToResourcePolicy(bucketPolicy);
    // cloudfront function: basic authorization
    const authHandler = new cloudfront.Function(this, 'BasicAuthHandler', {
      functionName: `BasicAuthHandler-${suffix}`,
      code: cloudfront.FunctionCode.fromFile({ filePath: "lib/lambda/basicauth.js", }),
    });
    // Cloudfront distribution
    const dist = new cloudfront.CloudFrontWebDistribution(this, "HostingBucketDist", {
      viewerCertificate: viewerCert,
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: bucket,
            originAccessIdentity: oai,
          },
          behaviors: [
            {
              isDefaultBehavior: true,
              allowedMethods: cloudfront.CloudFrontAllowedMethods.GET_HEAD,
              cachedMethods: cloudfront.CloudFrontAllowedCachedMethods.GET_HEAD,
              functionAssociations: [
                {
                  eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
                  function: authHandler,
                },
              ],
            },
          ],
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
    });

    const record = !!vars.domain && !!hostedZone ? new route53.ARecord(this, `DistRecord`, {
      recordName: `${vars.domain.hostname}.${vars.domain.hostedZoneName}`,
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(dist)),
      ttl: Duration.seconds(300),
    }) : undefined;
  }
}
