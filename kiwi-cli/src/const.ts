/**
 * @author linhuiw
 * @desc 项目配置文件配置信息
 */

export const KIWI_CONFIG_FILE = 'i18n.config.json';

export const PROJECT_CONFIG = {
  dir: './.kiwi',
  defaultConfig: {
    localeDir: './.kiwi',
    fileType: 'ts',
    srcLang: 'zh-CN',
    distLangs: ['en-US', 'zh-TW'],
    googleApiKey: '',
    baiduApiKey: {
      appId: '',
      appKey: ''
    },
    baiduLangMap: {
      ['en-US']: 'en',
      ['zh-TW']: 'cht'
    },
    translateOptions: {
      concurrentLimit: 10,
      requestOptions: {}
    },
    importI18N: `import I18N from 'src/utils/I18N';`,
    ignoreDir: [],
    ignoreFile: []
  },
  langMap: {
    ['en-US']: 'en',
    ['en_US']: 'en'
  },
  zhIndexFile: `import common from './common';

export default Object.assign({}, {
  common
});`,
  zhTestFile: `export default {
    test: '测试'
  }`
};
