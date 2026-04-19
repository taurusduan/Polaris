/**
 * 语音识别 Hook
 *
 * 固定配置：连续识别 + 显示临时结果
 * 支持唤醒词模式：待命状态下仅响应唤醒词，激活后才将语音写入输入框
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { speechService } from '../services/speechService';
import type {
  SpeechRecognitionStatus,
  SpeechRecognitionError,
  SpeechLanguage,
  VoiceCommand,
  WakeWordConfig,
} from '../types/speech';
import { checkVoiceCommand, matchWakeWord } from '../types/speech';
import { createLogger } from '../utils/logger';

const log = createLogger('useSpeechRecognition');

export interface UseSpeechRecognitionOptions {
  /** 识别语言 */
  language?: SpeechLanguage;
  /** 识别结果回调 */
  onResult?: (transcript: string) => void;
  /** 错误回调 */
  onError?: (error: SpeechRecognitionError) => void;
  /** 语音命令回调 */
  onCommand?: (command: VoiceCommand) => void;
  /** 唤醒词配置（启用时生效） */
  wakeWordConfig?: WakeWordConfig;
  /** 获取当前唤醒激活状态 */
  getWakeActive?: () => boolean;
  /** 设置唤醒激活状态 */
  setWakeActive?: (active: boolean) => void;
}

export interface UseSpeechRecognitionReturn {
  /** 当前状态 */
  status: SpeechRecognitionStatus;
  /** 临时识别结果 */
  interimTranscript: string;
  /** 是否支持语音识别 */
  isSupported: boolean;
  /** 错误信息 */
  error: SpeechRecognitionError | null;
  /** 开始识别 */
  start: () => void;
  /** 停止识别 */
  stop: () => void;
  /** 切换识别状态 */
  toggle: () => void;
  /** 是否正在识别 */
  isListening: boolean;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const {
    language = 'zh-CN',
    onResult,
    onError,
    onCommand,
    wakeWordConfig,
    getWakeActive,
    setWakeActive,
  } = options;

  const [status, setStatus] = useState<SpeechRecognitionStatus>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<SpeechRecognitionError | null>(null);

  const isSupported = speechService.supported;
  const isListening = status === 'listening';

  // 使用 ref 保存回调和配置，避免闭包问题
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const onCommandRef = useRef(onCommand);
  const wakeWordConfigRef = useRef(wakeWordConfig);
  const getWakeActiveRef = useRef(getWakeActive);
  const setWakeActiveRef = useRef(setWakeActive);

  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
    onCommandRef.current = onCommand;
    wakeWordConfigRef.current = wakeWordConfig;
    getWakeActiveRef.current = getWakeActive;
    setWakeActiveRef.current = setWakeActive;
  }, [onResult, onError, onCommand, wakeWordConfig, getWakeActive, setWakeActive]);

  // 初始化服务
  useEffect(() => {
    if (!isSupported) return;

    // 设置回调
    speechService.setCallbacks({
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
        if (newStatus === 'idle') {
          setInterimTranscript('');
        }
      },
      onResult: (transcript, isFinal) => {
        if (isFinal) {
          // 1. 检查是否是语音命令（仅最终结果）
          const command = checkVoiceCommand(transcript);
          if (command) {
            log.info('检测到语音命令:', { command });
            onCommandRef.current?.(command);
            return; // 命令不填入输入框
          }

          // 2. 唤醒词模式未启用 → 直接写入（保持原有行为）
          const wakeConfig = wakeWordConfigRef.current;
          if (!wakeConfig?.enabled) {
            onResultRef.current?.(transcript);
            return;
          }

          // 3. 唤醒词模式启用 → 状态门控
          const isActive = getWakeActiveRef.current?.() ?? false;

          if (!isActive) {
            // 待命状态：检查是否匹配唤醒词
            const match = matchWakeWord(transcript, wakeConfig.words);
            if (match) {
              log.info('唤醒词匹配:', { wakeWord: match.wakeWord, content: match.content });
              setWakeActiveRef.current?.(true);
              // 唤醒词后紧跟的内容也写入
              if (match.content) {
                onResultRef.current?.(match.content);
              }
            }
            // 不匹配 → 丢弃
          } else {
            // 激活状态：正常写入
            onResultRef.current?.(transcript);
          }
        } else {
          setInterimTranscript(transcript);
        }
      },
      onError: (err) => {
        setError(err);
        onErrorRef.current?.(err);
      }
    });

    return () => {
      // 不销毁服务，保持单例
    };
  }, [isSupported]);

  // 应用语言配置
  useEffect(() => {
    if (isSupported) {
      speechService.setConfig({
        enabled: true,
        language,
        // 固定配置
        continuous: true,
        interimResults: true,
      });
    }
  }, [language, isSupported]);

  const start = useCallback(() => {
    if (!isSupported) {
      log.warn('语音识别不可用');
      return;
    }

    setError(null);
    setInterimTranscript('');
    speechService.start();
  }, [isSupported]);

  const stop = useCallback(() => {
    speechService.stop();
  }, []);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  return {
    status,
    interimTranscript,
    isSupported,
    error,
    start,
    stop,
    toggle,
    isListening,
  };
}
