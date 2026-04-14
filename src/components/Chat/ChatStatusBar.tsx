/**
 * 聊天状态栏组件
 *
 * 显示当前对话的状态信息：
 * - 会话配置选择器 (Agent/Model/Effort/Permission)
 * - 引擎版本
 * - 语音识别按钮
 * - TTS 播放控制
 * - 输入状态提示
 * - 流式状态指示
 * - 输入字数
 */

import { useEffect, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfigStore, useChatInputStore } from '../../stores';
import { useActiveSessionActions, useActiveSessionStreaming } from '../../stores/conversationStore/useActiveSession';
import { useSessionConfig } from '../../stores/sessionConfigStore';
import { Paperclip, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { IconMic, IconVolume, IconVolumeX } from '../Common/Icons';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useTTS } from '../../hooks/useTTS';
import type { SpeechConfig, VoiceCommand, TTSConfig } from '../../types/speech';
import { DEFAULT_TTS_CONFIG } from '../../types/speech';
import { SessionConfigSelector } from './SessionConfigSelector';

interface ChatStatusBarProps {
  children?: ReactNode;
}

/**
 * 聊天状态栏组件
 */
export function ChatStatusBar({ children }: ChatStatusBarProps) {
  const { t } = useTranslation('chat');
  const { config, healthStatus, updateConfig } = useConfigStore();
  const isStreaming = useActiveSessionStreaming();
  const { interrupt } = useActiveSessionActions();
  const {
    inputLength,
    attachmentCount,
    suggestionMode,
    hasPendingQuestion,
    hasActivePlan,
    appendSpeechTranscript,
    setSpeechCommand,
    speechCommand,
    undoSpeechTranscript,
  } = useChatInputStore();

  // 会话配置
  const { config: sessionConfig, setConfig: setSessionConfig } = useSessionConfig();

  // 语音识别配置
  const speechConfig = config?.speech as SpeechConfig | undefined;
  const speechEnabled = speechConfig?.enabled ?? true;

  // TTS 配置
  const ttsConfig = config?.tts as TTSConfig | undefined;
  const ttsEnabled = ttsConfig?.enabled ?? false;

  // TTS Hook
  const {
    status: ttsStatus,
    stop: stopTTS,
  } = useTTS();

  // 处理 TTS 按钮点击
  const handleTTSClick = useCallback(() => {
    if (!config) return;

    if (ttsStatus === 'playing') {
      stopTTS();
    } else if (ttsStatus === 'paused') {
      stopTTS();
      updateConfig({
        ...config,
        tts: { ...(ttsConfig || DEFAULT_TTS_CONFIG), enabled: false },
      });
    } else if (ttsStatus === 'idle' || ttsStatus === 'error') {
      if (!ttsEnabled) {
        updateConfig({
          ...config,
          tts: { ...(ttsConfig || DEFAULT_TTS_CONFIG), enabled: true },
        });
      }
    }
  }, [ttsStatus, stopTTS, ttsEnabled, ttsConfig, config, updateConfig]);

  // 语音识别 Hook
  const {
    interimTranscript,
    isSupported: speechSupported,
    start: startSpeech,
    stop: stopSpeech,
    isListening,
  } = useSpeechRecognition({
    language: speechConfig?.language || 'zh-CN',
    onResult: (transcript) => {
      appendSpeechTranscript(transcript);
    },
    onCommand: (command: VoiceCommand) => {
      setSpeechCommand(command);
    }
  });

  // 处理语音命令
  useEffect(() => {
    if (!speechCommand) return;

    switch (speechCommand) {
      case 'interrupt':
        if (isStreaming) {
          interrupt();
        }
        break;
      case 'undo':
        undoSpeechTranscript();
        break;
    }

    if (speechCommand === 'interrupt' || speechCommand === 'undo') {
      setSpeechCommand(null);
    }
  }, [speechCommand, isStreaming, interrupt, setSpeechCommand, undoSpeechTranscript]);

  // 获取输入状态提示文本
  const getInputHint = () => {
    if (hasPendingQuestion) {
      return { text: t('question.pendingAnswer'), type: 'accent' as const };
    }
    if (hasActivePlan) {
      return { text: t('plan.pendingApproval'), type: 'violet' as const };
    }
    if (suggestionMode === 'workspace') {
      return { text: t('input.selectWorkspace'), type: 'default' as const };
    }
    if (suggestionMode === 'file') {
      return { text: t('input.selectFile'), type: 'default' as const };
    }
    if (suggestionMode === 'git') {
      return { text: t('input.gitContext'), type: 'default' as const };
    }
    if (attachmentCount > 0) {
      return { text: t('input.attachmentCount', { count: attachmentCount }), type: 'default' as const };
    }
    return null;
  };

  const inputHint = getInputHint();

  return (
    <div className={clsx(
      'flex items-center justify-between gap-4 px-4 py-1.5 text-xs text-text-tertiary',
      'bg-background-surface/50 border-t border-border-subtle'
    )}>
      {/* 左侧：版本 + 会话配置选择器 + children（多会话切换按钮等） */}
      <div className="flex items-center gap-2">
        {children}
        {config?.defaultEngine === 'claude-code' && healthStatus?.claudeVersion && (
          <span className="px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/20">
            v{healthStatus.claudeVersion}
          </span>
        )}
        {/* 会话配置选择器 */}
        <SessionConfigSelector
          config={sessionConfig}
          onChange={setSessionConfig}
          disabled={isStreaming}
        />
      </div>

      {/* 右侧：语音、状态提示和字数 */}
      <div className="flex items-center gap-3">
        {/* 语音识别 */}
        {speechEnabled && speechSupported && (
          <button
            onClick={isListening ? stopSpeech : startSpeech}
            className={clsx(
              'flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors',
              isListening
                ? 'bg-primary/10 text-primary'
                : 'text-text-tertiary hover:text-text-primary hover:bg-background-hover'
            )}
            title={isListening ? t('speech.stop', '停止语音识别') : t('speech.start', '开始语音识别')}
          >
            <IconMic size={14} className={isListening ? 'animate-pulse' : ''} />
            {isListening && (
              <span className="max-w-[200px] truncate">
                {interimTranscript || t('speech.listening', '正在听...')}
              </span>
            )}
          </button>
        )}

        {/* TTS 播放控制 */}
        <button
          onClick={handleTTSClick}
          disabled={ttsStatus === 'synthesizing'}
          className={clsx(
            'flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors',
            ttsStatus === 'playing' && 'bg-primary/10 text-primary',
            ttsStatus === 'paused' && 'text-text-secondary hover:text-text-primary hover:bg-background-hover',
            ttsStatus === 'synthesizing' && 'text-warning cursor-wait',
            (ttsStatus === 'idle' || ttsStatus === 'error') && (ttsEnabled
              ? 'text-text-muted cursor-not-allowed'
              : 'text-text-tertiary hover:text-text-primary hover:bg-background-hover'
            )
          )}
          title={
            ttsStatus === 'playing' ? t('tts.stop', '停止播放') :
            ttsStatus === 'paused' ? t('tts.disable', '关闭语音播放') :
            ttsStatus === 'synthesizing' ? t('tts.synthesizing', '合成中...') :
            ttsEnabled ? t('tts.idle', '语音播放') : t('tts.enable', '开启语音播放')
          }
        >
          {ttsStatus === 'synthesizing' && <Loader2 size={14} className="animate-spin" />}
          {(ttsStatus === 'playing' || ttsStatus === 'paused') && (
            <IconVolume size={14} className={ttsStatus === 'playing' ? 'animate-pulse' : ''} />
          )}
          {(ttsStatus === 'idle' || ttsStatus === 'error') && (
            <IconVolumeX size={14} />
          )}
        </button>

        {/* 输入状态提示 */}
        {inputHint && (
          <span className={clsx(
            'flex items-center gap-1.5',
            inputHint.type === 'accent' && 'text-accent',
            inputHint.type === 'violet' && 'text-violet-500'
          )}>
            {inputHint.type !== 'default' && <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse" />}
            {attachmentCount > 0 && inputHint.type === 'default' && <Paperclip size={12} />}
            {inputHint.text}
          </span>
        )}

        {/* 流式状态指示 */}
        {isStreaming && (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
            <span className="text-primary">{t('statusBar.responding')}</span>
          </div>
        )}

        {/* 字数 */}
        {inputLength > 0 && (
          <span className="text-text-tertiary">{inputLength}</span>
        )}
      </div>
    </div>
  );
}