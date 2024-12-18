/**
 * @author doubledream
 * @desc 提取指定文件夹下的中文
 */

import * as _ from 'lodash';
import * as slash from 'slash2';
import * as path from 'path';
import * as fs from 'fs';

import { getSpecifiedFiles, readFile, writeFile, isFile, isDirectory } from './file';
import { findChineseText } from './findChineseText';
import { getSuggestLangObj } from './getLangData';
import {
  findMatchKey,
  findMatchValue,
  successInfo,
  failInfo,
  highlightText,
  getLangDir,
  createFileAndDirectories,
  getProjectConfig,
  getFilePathWithoutCwd
} from '../utils';
import { replaceAndUpdate, hasImportI18N, createImportI18N } from './replace';

const CONFIG = getProjectConfig();

/**
 * 剔除 kiwiDir 下的文件
 */
function removeLangsFiles(files: string[]) {
  const langsDir = path.resolve(process.cwd(), CONFIG.kiwiDir);
  return files.filter(file => {
    const completeFile = path.resolve(process.cwd(), file);
    return !completeFile.includes(langsDir);
  });
}

/**
 * 递归匹配项目中所有的代码的中文
 */
function findAllChineseText(dir: string) {
  const first = dir.split(',')[0];
  let files = [];
  if (isDirectory(first)) {
    const dirPath = path.resolve(process.cwd(), dir);
    files = getSpecifiedFiles(dirPath, CONFIG.ignoreDir, CONFIG.ignoreFile);
  } else {
    files = removeLangsFiles(dir.split(','));
  }
  const filterFiles = files.filter(file => {
    return (
      (isFile(file) && file.endsWith('.ts')) || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')
    );
  });
  const allTexts = filterFiles.reduce((pre, file) => {
    const code = readFile(file);
    const texts = findChineseText(code, file);
    // 调整文案顺序，保证从后面的文案往前替换，避免位置更新导致替换出错
    const sortTexts = _.sortBy(texts, obj => -obj.range.start);
    if (texts.length > 0) {
      console.log(`${highlightText(file)} 发现 ${highlightText(texts.length)} 处中文文案`);
    }

    return texts.length > 0 ? pre.concat({ file, texts: sortTexts }) : pre;
  }, []);

  return allTexts;
}

/**
 * 处理作为key值的翻译原文
 */
function getTransOriginText(text: string) {
  // 避免翻译的字符里包含数字或者特殊字符等情况，只过滤出汉字和字母
  const reg = /[a-zA-Z\u4e00-\u9fa5]+/g;
  const findText = text.match(reg) || [];
  const transOriginText = findText ? findText.join('').slice(0, 5) : '中文符号';

  return transOriginText;
}

/**
 * @param currentFilename 文件路径
 * @returns string[]
 */
function getSuggestion(currentFilename: string, dirPath) {
  const fileNameWithoutCwd = getFilePathWithoutCwd(currentFilename, dirPath);

  const names = slash(fileNameWithoutCwd).split('/');
  const fileName = _.last(names) as any;
  const fileKey = fileName.split('.')[0].replace(new RegExp('-', 'g'), '_');
  const dir = names.slice(0, -1).join('.');
  if (dir) return [dir, fileKey];
  return [fileKey];
}

/**
 * 统一处理key值，已提取过的文案直接替换，翻译后的key若相同，加上出现次数
 * @param currentFilename 文件路径
 * @param langsPrefix 替换后的前缀
 * @param translateTexts 翻译后的key值
 * @param targetStrs 当前文件提取后的文案
 * @returns any[] 最终可用于替换的key值和文案
 */
function getReplaceableStrs({
  currentFilename,
  langsPrefix,
  translateTexts,
  targetStrs,
  dir
}: {
  currentFilename: string;
  langsPrefix: string;
  translateTexts: string[];
  targetStrs: any[];
  dir: string;
}) {
  const finalLangObj = getSuggestLangObj();
  const virtualMemory = {};
  const suggestion = getSuggestion(currentFilename, dir);
  const replaceableStrs = targetStrs.reduce((prev, curr, i) => {
    const _text = curr.text;
    let key = findMatchKey(finalLangObj, _text);
    if (key) {
      key = key.replace(/-/g, '_');
    }
    if (!virtualMemory[_text]) {
      if (key) {
        virtualMemory[_text] = key;
        return prev.concat({
          target: curr,
          key,
          needWrite: false
        });
      }
      const transText = translateTexts[i] && _.camelCase(translateTexts[i] as string);
      let transKey = `${suggestion.length ? suggestion.join('.') + '.' : ''}${transText}`;
      transKey = transKey.replace(/-/g, '_');
      if (langsPrefix) {
        transKey = `${langsPrefix}.${transText}`;
      }
      let occurTime = 1;
      // 防止出现前四位相同但是整体文案不同的情况
      while (
        findMatchValue(finalLangObj, transKey) !== _text &&
        _.keys(finalLangObj).includes(`${transKey}${occurTime >= 2 ? occurTime : ''}`)
      ) {
        occurTime++;
      }
      if (occurTime >= 2) {
        transKey = `${transKey}${occurTime}`;
      }
      virtualMemory[_text] = transKey;
      finalLangObj[transKey] = _text;
      return prev.concat({
        target: curr,
        key: transKey,
        needWrite: true
      });
    } else {
      return prev.concat({
        target: curr,
        key: virtualMemory[_text],
        needWrite: true
      });
    }
  }, []);

  return replaceableStrs;
}

/**
 * 随机生成 key
 * @param {contentArray} 需要生成 key 的数组
 */
// function batchTranslate(contentArray) {
//   return contentArray.map(() => `I${nanoid(8)}`);
// }

/**
 * 随机生成 key
 * @param {contentArray} 需要生成 key 的数组
 */

function batchTranslateUseKey(contentArray) {
  return contentArray.map((_, i) =>
    `${String.fromCharCode(65 + Math.floor(Math.random() * 25))}_${i}`
      .replace(/[^a-zA-Z0-9]/g, ' ')
      .replace(/^\w|\s\.?\w/g, m => m.toUpperCase())
      .split(/\s\.?/, 5)
      .join('')
  );
}

function batchChangeDupKey({ targetPath, translateTexts, extractMap, dir }) {
  const fileName = getFilePathWithoutCwd(targetPath, dir);

  const objPath = fileName
    .split('.')?.[0]
    .split('/')
    .join('.');

  if (!objPath) return;

  const history = {};

  Object.keys(_.get(extractMap, objPath) ?? {}).forEach(key => {
    history[key] = 0;
  });

  return translateTexts.map(item => {
    if (history[item] >= 0) {
      let index = history[item] + 1;
      history[item] = index;
      return `${item}.${index}`;
    }
    return item;
  });
}

/**
 * 递归匹配项目中所有的代码的中文
 * @param {dirPath} 文件夹路径
 */
function extractAll({ dirPath, prefix }: { dirPath?: string; prefix?: string }) {
  const dir = dirPath || './';
  // 去除I18N
  const langsPrefix = prefix ? prefix.replace(/^I18N\./, '') : null;

  const allTargetStrs = findAllChineseText(dir);
  if (allTargetStrs.length === 0) {
    console.log(highlightText('没有发现可替换的文案！'));
    return;
  }

  const srcLangDir = getLangDir(CONFIG.srcLang);
  const targetFilename = `${srcLangDir}/index.json`;

  let extractMap = {};
  if (fs.existsSync(targetFilename)) {
    const content = fs.readFileSync(targetFilename, 'utf-8') ?? '{}';
    if (content) extractMap = JSON.parse(content);
  }

  // 对当前文件进行文案key生成和替换
  const generateKeyAndReplace = async item => {
    const currentFilename = item.file;
    console.log(`${currentFilename} 替换中...`);
    // 过滤掉模板字符串内的中文，避免替换时出现异常
    const targetStrs = item.texts;

    const translateOriginTexts = targetStrs.reduce((prev, curr) => {
      const transOriginText = getTransOriginText(curr.text);
      return prev.concat([transOriginText]);
    }, []);

    const translateTexts = await batchTranslateUseKey(translateOriginTexts);

    batchChangeDupKey({ targetPath: currentFilename, translateTexts, extractMap, dir });
    if (translateTexts.length === 0) {
      failInfo(`未得到翻译结果，${currentFilename}替换失败！`);
      return;
    }
    const replaceableStrs = getReplaceableStrs({ currentFilename, langsPrefix, translateTexts, targetStrs, dir });

    await replaceableStrs
      .reduce((prev, obj) => {
        return prev.then(() => {
          return replaceAndUpdate(currentFilename, obj.target, `I18N.${obj.key}`, false, obj.needWrite, extractMap);
        });
      }, Promise.resolve())
      .then(() => {
        // 添加 import I18N
        if (!hasImportI18N(currentFilename)) {
          const code = createImportI18N(currentFilename);

          writeFile(currentFilename, code);
        }
        successInfo(`${currentFilename} 替换完成，共替换 ${targetStrs.length} 处文案！`);
      })
      .catch(e => {
        failInfo(e.message);
      });
    return targetStrs.length;
  };

  let result = 0;
  allTargetStrs
    .reduce((prev, current) => {
      return prev.then(res => {
        result += res;
        return generateKeyAndReplace(current);
      });
    }, Promise.resolve(0))
    .then(() => {
      createFileAndDirectories(targetFilename, `${JSON.stringify(extractMap, null, 2)}`);
      successInfo(`全部替换完成！共替换${highlightText(result)}处文本`);
    })
    .catch((e: any) => {
      failInfo(e.message);
    });
}

export { extractAll };
