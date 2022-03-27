/** 環境名の定義 */
export enum Environments {
  SAMLPLE = 'sample'
}

/** 環境変数のinterface */
export interface EnvironmentVariables {
  stackName?: string;
  region?: string;
  domain?: Domain,
}
export interface Domain {
  hostname: string;
  hostedZoneId: string;
  hostedZoneName: string;
}

/** 環境変数の設定値 */
const EnvironmentVariablesSetting: { [key: string]: EnvironmentVariables } = {
  [Environments.SAMLPLE]: {},
}

/**
* @param env デプロイ対象の環境
* @return envに対応する環境変数
*/
export function variablesOf(env: Environments): EnvironmentVariables {
  return EnvironmentVariablesSetting[env];
}
