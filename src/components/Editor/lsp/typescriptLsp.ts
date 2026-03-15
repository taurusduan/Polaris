/**
 * TypeScript/JavaScript WASM LSP 集成
 * 使用 @valtown/codemirror-ts 实现 TypeScript 智能功能
 */

import { Extension } from '@codemirror/state';
import { autocompletion } from '@codemirror/autocomplete';
import {
  tsAutocomplete,
  tsLinter,
  tsSync,
  tsHover,
  tsFacet,
} from '@valtown/codemirror-ts';
import {
  createDefaultMapFromCDN,
  createSystem,
  createVirtualTypeScriptEnvironment,
  VirtualTypeScriptEnvironment,
} from '@typescript/vfs';
import * as ts from 'typescript';
import type { LSPLocation } from '../../../types/lsp';

// 缓存环境，避免重复创建
let tsEnv: VirtualTypeScriptEnvironment | null = null;
let envInitPromise: Promise<void> | null = null;

// 使用已验证可用的 CDN 版本（避免 ts.version 与 CDN 版本不匹配）
// TypeScript Playground CDN 版本列表: https://playgroundcdn.typescriptlang.org/index.json
const TS_CDN_VERSION = '5.4.5';

/**
 * 创建或更新文件
 * 在 TypeScript 中，需要先创建文件才能更新
 */
function createOrUpdateFile(env: VirtualTypeScriptEnvironment, path: string, code: string): void {
  if (!env.getSourceFile(path)) {
    env.createFile(path, code);
  } else {
    env.updateFile(path, code);
  }
}

/**
 * 初始化 TypeScript 环境
 */
async function initTSEnvironment(): Promise<void> {
  if (tsEnv) return;

  if (envInitPromise) {
    await envInitPromise;
    return;
  }

  envInitPromise = (async () => {
    try {
      console.log(`[TypeScript LSP] Initializing with CDN version ${TS_CDN_VERSION}...`);

      // 创建默认库文件映射（使用固定 CDN 版本）
      const fsMap = await createDefaultMapFromCDN(
        { target: ts.ScriptTarget.ES2022 },
        TS_CDN_VERSION,
        true,
        ts
      );

      // 创建系统
      const system = createSystem(fsMap);

      // 创建虚拟 TypeScript 环境
      tsEnv = createVirtualTypeScriptEnvironment(system, [], ts, {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        skipLibCheck: true,
        jsx: ts.JsxEmit.ReactJSX,
      });
    } catch (error) {
      console.error('[TypeScript LSP] Failed to initialize environment:', error);
      envInitPromise = null;
      throw error;
    }
  })();

  await envInitPromise;
}

/**
 * 获取或创建 TypeScript 环境
 */
export async function getTSEnvironment(): Promise<VirtualTypeScriptEnvironment | null> {
  if (!tsEnv) {
    await initTSEnvironment();
  }
  return tsEnv;
}

/**
 * 更新文件内容到 TypeScript 环境
 */
export function updateTSFile(path: string, content: string): void {
  if (!tsEnv) return;

  const filePath = path.startsWith('file://') ? path : `file://${path}`;
  createOrUpdateFile(tsEnv, filePath, content);
}

/**
 * 跳转到定义（手动实现）
 */
export function gotoDefinition(
  path: string,
  content: string,
  line: number,
  character: number
): LSPLocation | null {
  if (!tsEnv) return null;

  const filePath = path.startsWith('file://') ? path : `file://${path}`;

  // 确保文件存在于环境中
  updateTSFile(path, content);

  // 获取源文件
  const sourceFile = tsEnv.getSourceFile(filePath);
  if (!sourceFile) return null;

  // 计算偏移量
  const position = sourceFile.getPositionOfLineAndCharacter(line, character);

  // 获取定义
  const definitions = tsEnv.languageService.getDefinitionAtPosition(filePath, position);
  if (!definitions || definitions.length === 0) return null;

  const def = definitions[0];
  const defFile = tsEnv.getSourceFile(def.fileName);
  if (!defFile) return null;

  const startPos = defFile.getLineAndCharacterOfPosition(def.textSpan.start);
  const endPos = defFile.getLineAndCharacterOfPosition(def.textSpan.start + def.textSpan.length);

  return {
    uri: def.fileName,
    range: {
      start: { line: startPos.line, character: startPos.character },
      end: { line: endPos.line, character: endPos.character },
    },
  };
}

/**
 * 查找引用（手动实现）
 */
export function findReferences(
  path: string,
  content: string,
  line: number,
  character: number
): LSPLocation[] {
  if (!tsEnv) return [];

  const filePath = path.startsWith('file://') ? path : `file://${path}`;

  // 确保文件存在于环境中
  updateTSFile(path, content);

  // 获取源文件
  const sourceFile = tsEnv.getSourceFile(filePath);
  if (!sourceFile) return [];

  // 计算偏移量
  const position = sourceFile.getPositionOfLineAndCharacter(line, character);

  // 获取引用
  const references = tsEnv.languageService.getReferencesAtPosition(filePath, position);
  if (!references) return [];

  return references
    .map((ref: ts.ReferenceEntry) => {
      const refFile = tsEnv?.getSourceFile(ref.fileName);
      if (!refFile) return null;

      const startPos = refFile.getLineAndCharacterOfPosition(ref.textSpan.start);
      const endPos = refFile.getLineAndCharacterOfPosition(ref.textSpan.start + ref.textSpan.length);

      return {
        uri: ref.fileName,
        range: {
          start: { line: startPos.line, character: startPos.character },
          end: { line: endPos.line, character: endPos.character },
        },
      };
    })
    .filter((loc): loc is LSPLocation => loc !== null);
}

/**
 * 获取悬停信息（手动实现）
 */
export function getHoverInfo(
  path: string,
  content: string,
  line: number,
  character: number
): { type: string; documentation?: string } | null {
  if (!tsEnv) return null;

  const filePath = path.startsWith('file://') ? path : `file://${path}`;

  // 确保文件存在于环境中
  updateTSFile(path, content);

  // 获取源文件
  const sourceFile = tsEnv.getSourceFile(filePath);
  if (!sourceFile) return null;

  // 计算偏移量
  const position = sourceFile.getPositionOfLineAndCharacter(line, character);

  // 获取快速信息
  const quickInfo = tsEnv.languageService.getQuickInfoAtPosition(filePath, position);
  if (!quickInfo) return null;

  return {
    type: ts.displayPartsToString(quickInfo.displayParts || []),
    documentation: quickInfo.documentation ? ts.displayPartsToString(quickInfo.documentation) : undefined,
  };
}

/**
 * 创建 TypeScript/JavaScript LSP 扩展
 */
export async function createTypeScriptExtensions(
  filePath: string,
  initialContent: string
): Promise<Extension[]> {
  // 确保 TypeScript 环境已初始化
  await initTSEnvironment();

  if (!tsEnv) {
    console.warn('[TypeScript LSP] Environment not initialized');
    return [];
  }

  const normalizedPath = filePath.startsWith('file://') ? filePath : `file://${filePath}`;

  // 确保文件在环境中
  updateTSFile(filePath, initialContent);

  // 扩展数组
  const extensions: Extension[] = [
    // 配置 facet
    tsFacet.of({
      env: tsEnv,
      path: normalizedPath,
    }),
    // 同步文件内容
    tsSync(),
    // 智能补全 (需要包装 autocompletion)
    autocompletion({
      override: [tsAutocomplete()],
    }),
    // 类型检查 lint
    tsLinter(),
    // 悬停提示
    tsHover(),
  ];

  return extensions;
}

/**
 * 创建 JavaScript LSP 扩展（实际上是 TypeScript 的子集）
 */
export async function createJavaScriptExtensions(
  filePath: string,
  initialContent: string
): Promise<Extension[]> {
  return createTypeScriptExtensions(filePath, initialContent);
}

/**
 * 清理 TypeScript 环境（卸载时调用）
 */
export function cleanupTSEnvironment(): void {
  tsEnv = null;
  envInitPromise = null;
}
