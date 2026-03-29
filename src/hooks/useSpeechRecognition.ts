/**
 * 语音识别 Hook
 *
 * 固定配置：连续识别 + 显示临时结果
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { speechService } from '../services/speechService';
import type {
  SpeechRecognitionStatus,
  SpeechRecognitionError,
  SpeechLanguage,
  VoiceCommand
} from '../types/speech';
import { checkVoiceCommand } from '../types/speech';
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
  const { language = 'zh-CN', onResult, onError, onCommand } = options;

  const [status, setStatus] = useState<SpeechRecognitionStatus>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<SpeechRecognitionError | null>(null);

  const isSupported = speechService.supported;
  const isListening = status === 'listening';

  // 使用 ref 保存回调，避免重复注册
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const onCommandRef = useRef(onCommand);

  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
    onCommandRef.current = onCommand;
  }, [onResult, onError, onCommand]);

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
          // 检查是否是语音命令（仅最终结果）
          const command = checkVoiceCommand(transcript);
          if (command) {
            log.info('检测到语音命令:', { command });
            onCommandRef.current?.(command);
            return; // 命令不填入输入框
          }

          onResultRef.current?.(transcript);
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
