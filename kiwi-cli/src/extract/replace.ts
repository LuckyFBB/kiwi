/**
 * @author doubledream
 * @desc 更新文件
 */

import * as _ from 'lodash';
import * as prettier from 'prettier';
import * as ts from 'typescript';
import { readFile, writeFile } from './file';
import { getProjectConfig, getLangDir, failInfo } from '../utils';

const CONFIG = getProjectConfig();
const srcLangDir = getLangDir(CONFIG.srcLang);

function updateLangFiles(keyValue, text, validateDuplicate, extractMap) {
  if (!_.startsWith(keyValue, 'I18N.')) {
    return;
  }

  const [, filename, ...restPath] = keyValue.split('.');
  const fullKey = [filename, ...restPath].join('.');
  const targetFilename = `${srcLangDir}/index.${CONFIG.fileType}`;

  if (validateDuplicate && _.get(extractMap, fullKey) !== undefined) {
    failInfo(`${targetFilename} 中已存在 key 为 \`${fullKey}\` 的翻译，请重新命名变量`);
    throw new Error('duplicate');
  }
  // \n 会被自动转义成 \\n，这里转回来
  text = text.replace(/\\n/gm, '\n');
  _.set(extractMap, fullKey, text);
}

/**
 * 检查是否添加 import I18N 命令
 * @param filePath 文件路径
 */
function hasImportI18N(filePath) {
  const code = readFile(filePath);
  const ast = ts.createSourceFile('', code, ts.ScriptTarget.ES2015, true, ts.ScriptKind.TSX);
  let hasImportI18N = false;

  function visit(node) {
    if (node.kind === ts.SyntaxKind.ImportDeclaration) {
      const importClause = node.importClause;

      // import I18N from 'src/utils/I18N';
      if (_.get(importClause, 'kind') === ts.SyntaxKind.ImportClause) {
        if (importClause.name) {
          if (importClause.name.escapedText === 'I18N') {
            hasImportI18N = true;
          }
        } else {
          const namedBindings = importClause.namedBindings;
          // import { I18N } from 'src/utils/I18N';
          if (namedBindings.kind === ts.SyntaxKind.NamedImports) {
            namedBindings.elements.forEach(element => {
              if (element.kind === ts.SyntaxKind.ImportSpecifier && _.get(element, 'name.escapedText') === 'I18N') {
                hasImportI18N = true;
              }
            });
          }
          // import * as I18N from 'src/utils/I18N';
          if (namedBindings.kind === ts.SyntaxKind.NamespaceImport) {
            if (_.get(namedBindings, 'name.escapedText') === 'I18N') {
              hasImportI18N = true;
            }
          }
        }
      }
    }
  }

  ts.forEachChild(ast, visit);

  return hasImportI18N;
}

/**
 * 在合适的位置添加 import I18N 语句
 * @param filePath 文件路径
 */
function createImportI18N(filePath) {
  const code = readFile(filePath);
  const ast = ts.createSourceFile('', code, ts.ScriptTarget.ES2015, true, ts.ScriptKind.TSX);
  const isTsFile = _.endsWith(filePath, '.ts');
  const isTsxFile = _.endsWith(filePath, '.tsx');
  const isJsFile = _.endsWith(filePath, '.js');
  const isJsxFile = _.endsWith(filePath, '.jsx');
  const isVueFile = _.endsWith(filePath, '.vue');
  if (isTsFile || isTsxFile || isJsFile || isJsxFile) {
    const importStatement = `${CONFIG.importI18N}\n`;
    const pos = ast.getStart(ast, false);
    const updateCode = code.slice(0, pos) + importStatement + code.slice(pos);

    return updateCode;
  } else if (isVueFile) {
    const importStatement = `${CONFIG.importI18N}\n`;
    const updateCode = code.replace(/<script>/g, `<script>\n${importStatement}`);
    return updateCode;
  }
}

/**
 * 更新文件
 * @param filePath 当前文件路径
 * @param arg  目标字符串对象
 * @param val  目标 key
 * @param validateDuplicate 是否校验文件中已经存在要写入的 key
 * @param needWrite 是否只需要替换不需要更新 langs 文件
 */
function replaceAndUpdate(filePath, arg, val, validateDuplicate, needWrite = true, extractMap) {
  const code = readFile(filePath);
  const isHtmlFile = _.endsWith(filePath, '.html');
  const isVueFile = _.endsWith(filePath, '.vue');
  let newCode = code;
  let finalReplaceText = arg.text;
  const { start, end } = arg.range;
  if (arg.type === 'string') {
    const preTextStart = start - 1;
    const [last2Char] = code.slice(preTextStart, start + 1).split('');
    let finalReplaceVal = val;
    if (last2Char === '=' && isHtmlFile) {
      finalReplaceVal = '{{' + val + '}}';
    }
    newCode = `${code.slice(0, start)}${finalReplaceVal}${code.slice(end)}`;
  } else if (arg.type === 'jsx') {
    if (isHtmlFile || isVueFile) {
      newCode = `${code.slice(0, start)}{{${val}}}${code.slice(end)}`;
    } else {
      newCode = `${code.slice(0, start)}{${val}}${code.slice(end)}`;
    }
  }
  if (arg.type === 'template') {
    let finalReplaceVal = '${' + val + '}';
    newCode = `${code.slice(0, start)}${finalReplaceVal}${code.slice(end)}`;
  }

  try {
    if (needWrite) {
      // 更新语言文件
      updateLangFiles(val, finalReplaceText, validateDuplicate, extractMap);
    }
    // 若更新成功再替换代码
    return writeFile(filePath, newCode);
  } catch (e) {
    return Promise.reject(e.message);
  }
}

export { replaceAndUpdate, hasImportI18N, createImportI18N };
