import nunjucks from 'nunjucks';
import { JsonObject } from 'type-fest';
import YAML from 'yaml';
import { URL } from 'url';

import { decodeStringList, toBase64 } from './utils';
import {
  CLASH_UNSUPPORTED_RULE,
  MELLOW_UNSUPPORTED_RULE,
  QUANTUMULT_X_SUPPORTED_RULE
} from './utils/constant';

export default function getEngine(templateDir: string, publicUrl: string): nunjucks.Environment {
  const engine = nunjucks.configure(templateDir, {
    autoescape: false,
  });

  const clashFilter = (str: string): string => {
    const array = str.split('\n');

    return array
      .filter(item => {
        const testString: string = (!!item && item.trim() !== '') ? item.toUpperCase() : '';

        return CLASH_UNSUPPORTED_RULE.every(s => !testString.startsWith(s));
      })
      .map((item: string) => {
        if (item.startsWith('#') || item.trim() === '') {
          return item;
        }
        return `- ${item}`
          .replace(/,no-resolve/, '')
          .replace(/\/\/.*$/, '')
          .trim();
      })
      .join('\n');
  };

  engine.addFilter('patchYamlArray', clashFilter);
  engine.addFilter('clash', clashFilter);

  engine.addFilter('quantumultx', (str: string) => {
    const array = str.split('\n');

    return array
      .filter(item => {
        const testString: string = (!!item && item.trim() !== '') ? item.toUpperCase() : '';

        if (testString.startsWith('#') || testString === '') {
          return item;
        }

        // 过滤出支持的规则类型
        return QUANTUMULT_X_SUPPORTED_RULE.some(s => testString.startsWith(s));
      })
      .map((item: string) => {
        if (item.startsWith('http-response')) {
          return convertSurgeScriptRuleToQuantumultXRewriteRule(item, publicUrl);
        }
        return item;
      })
      .join('\n');
  });

  engine.addFilter('mellow', (str: string) => {
    const array = str.split('\n');

    return array
      .filter(item => {
        const testString: string = (!!item && item.trim() !== '') ? item.toUpperCase() : '';

        return MELLOW_UNSUPPORTED_RULE.every(s => !testString.startsWith(s));
      })
      .map((item: string) => {
        if (item.startsWith('#') || str.trim() === '') {
          return item;
        }
        return item
          .replace(/,no-resolve/, '')
          .replace(/\/\/.*$/, '')
          .trim();
      })
      .join('\n');
  });

  // yaml
  engine.addFilter('yaml', (obj: JsonObject) => YAML.stringify(obj));

  // base64
  engine.addFilter('base64', (str: string) => toBase64(str));

  // json
  engine.addFilter('json', (obj: JsonObject) => JSON.stringify(obj));

  engine.addFilter('hostname', (str: string) => {
    const array = str.split('\n');

    // 取出第一个 hostname 配置
    return array
    .filter(item => {
      const testString: string = (!!item && item.trim() !== '') ? item : '';
      return testString.startsWith('hostname');
    })[0];
  });

  engine.addFilter('surgeUrlRewrite', (str: string) => {
    const array = convertUrlRewriteSnippet(str);
    return array
    .filter(parts => {
      if (!parts || parts.length !== 4) {
        return false;
      }
      if (parts[1] !== 'url') {
        return false;
      }
      return parts[2] === '302' || parts[2] === '307';
    })
    .map(parts => {
      const result = [];
      result.push(parts[0], parts[3], parts[2]);
      return result.join(' ');
    })
    .join('\n');
  });

  return engine;
};

export const convertSurgeScriptRuleToQuantumultXRewriteRule = (str: string, publicUrl: string): string => {
  const parts = str.split(' ');
  const result = [];

  switch (parts[0]) {
    case 'http-response':
      const params = decodeStringList(parts.splice(2).join('').split(','));
      const scriptPath = params['script-path'];
      const apiEndpoint = new URL(publicUrl);
      apiEndpoint.pathname = '/qx-script';
      apiEndpoint.searchParams.set('url', `${scriptPath}`);

      // parts[1] => Effective URL Rule
      result.push(parts[1], 'url', 'script-response-body', apiEndpoint.toString());

      return result.join(' ');

    default:
      return '';
  }

};

export const convertUrlRewriteSnippet = (str: string): ReadonlyArray<readonly string[]> => {
  const array = str.split('\n');

  return array
  .filter(item => {
    const testString: string = (!!item && item.trim() !== '') ? item : '';
    // 忽略 hostname 配置
    return !testString.startsWith('hostname');
  })
  .map((item: string) => {
    const parts = item.trim().split(' ');
    const result = [];
    parts.filter(part => part && part.trim() !== '').forEach(part => result.push(part));
    return result;
  });

};
