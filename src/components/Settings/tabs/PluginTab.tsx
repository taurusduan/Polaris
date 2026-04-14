/**
 * Plugin 管理 Tab
 *
 * 三栏布局：分类导航 | 插件列表 | 插件详情
 * 支持分类筛选、排序、批量操作
 */

import { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Virtuoso } from 'react-virtuoso';
import { usePluginStore, useToastStore } from '../../../stores';
import { Button } from '../../Common';
import type { InstalledPlugin, AvailablePlugin, PluginScope, McpServerConfig } from '../../../types/plugin';

// 格式化 ISO 时间为本地时间
const formatDateTime = (isoString?: string): string => {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
};

// 格式化安装数量
const formatInstallCount = (count?: number): string => {
  if (!count) return '0';
  if (count >= 100000) return `${(count / 1000).toFixed(0)}k`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toString();
};

// 插件分类
type PluginCategory = 'all' | 'installed' | 'mcp' | 'developer' | 'git' | 'other';

const CATEGORY_ICONS: Record<PluginCategory, string> = {
  all: '📦',
  installed: '✓',
  mcp: '🔌',
  developer: '🛠',
  git: '📁',
  other: '📄',
};

// 判断插件类别
const getPluginCategory = (plugin: AvailablePlugin): PluginCategory => {
  const name = plugin.name.toLowerCase();
  const desc = (plugin.description || '').toLowerCase();

  if (name.includes('mcp') || desc.includes('mcp server') || desc.includes('mcp integration')) {
    return 'mcp';
  }
  if (name.includes('git') || name.includes('github') || name.includes('gitlab')) {
    return 'git';
  }
  if (name.includes('test') || name.includes('lint') || name.includes('lsp') ||
      name.includes('debug') || desc.includes('developer tool')) {
    return 'developer';
  }
  return 'other';
};

// 排序选项
type SortOption = 'popular' | 'name' | 'updated';

// MCP 服务器配置渲染组件
const McpServerCard = memo<{
  name: string;
  config: McpServerConfig;
  mcpType: string;
  mcpUrl: string;
  mcpCommand: string;
}>(({ name, config, mcpType, mcpUrl, mcpCommand }) => (
  <div className="text-sm bg-surface p-3 rounded border border-border-subtle">
    <div className="font-medium text-text-primary mb-2">{name}</div>
    <div className="space-y-1 text-xs">
      <div className="flex">
        <span className="w-12 flex-shrink-0 text-text-secondary">{mcpType}:</span>
        <span className="text-text-primary uppercase">{config.type || 'stdio'}</span>
      </div>
      {config.url && (
        <div className="flex">
          <span className="w-12 flex-shrink-0 text-text-secondary">{mcpUrl}:</span>
          <span className="text-text-primary break-all">{config.url}</span>
        </div>
      )}
      {config.command && (
        <div className="flex">
          <span className="w-12 flex-shrink-0 text-text-secondary">{mcpCommand}:</span>
          <span className="text-text-primary font-mono">
            {config.command} {config.args?.join(' ')}
          </span>
        </div>
      )}
    </div>
  </div>
));

McpServerCard.displayName = 'McpServerCard';

export function PluginTab() {
  const { t } = useTranslation('settings');
  const { success, error: toastError } = useToastStore();
  const {
    installed,
    available,
    marketplaces,
    selectedPlugin,
    loading,
    availableLoading,
    error,
    operatingPluginId,
    fetchInstalled,
    fetchAvailable,
    fetchMarketplaces,
    selectInstalledPlugin,
    selectAvailablePlugin,
    selectPlugin,
    installPlugin,
    enablePlugin,
    disablePlugin,
    updatePlugin,
    uninstallPlugin,
    clearError,
    addMarketplace,
    removeMarketplace,
    updateMarketplace,
  } = usePluginStore();

  // 状态
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<PluginCategory>('all');
  const [sortBy, setSortBy] = useState<SortOption>('popular');
  const [selectedScope, setSelectedScope] = useState<PluginScope>('user');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'install' | 'uninstall' | null>(null);

  // 市场管理状态
  const [showAddMarketModal, setShowAddMarketModal] = useState(false);
  const [newMarketSource, setNewMarketSource] = useState('');
  const [addingMarket, setAddingMarket] = useState(false);
  const [refreshingMarket, setRefreshingMarket] = useState<string | null>(null);

  // 初始化加载
  useEffect(() => {
    fetchInstalled();
    fetchAvailable();
    fetchMarketplaces();
  }, [fetchInstalled, fetchAvailable, fetchMarketplaces]);

  // 已安装插件 ID 集合
  const installedIds = useMemo(
    () => new Set(installed.map((p) => p.id)),
    [installed]
  );

  // 按类别过滤
  const categorizedPlugins = useMemo(() => {
    const result: Record<PluginCategory, AvailablePlugin[]> = {
      all: [],
      installed: [],
      mcp: [],
      developer: [],
      git: [],
      other: [],
    };

    available.forEach((plugin) => {
      const category = getPluginCategory(plugin);
      result[category].push(plugin);
      result.all.push(plugin);

      // 已安装类别
      if (installedIds.has(plugin.pluginId)) {
        result.installed.push(plugin);
      }
    });

    return result;
  }, [available, installedIds]);

  // 过滤和排序
  const filteredPlugins = useMemo(() => {
    let list = categorizedPlugins[selectedCategory];

    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.pluginId.toLowerCase().includes(query) ||
          (p.description || '').toLowerCase().includes(query)
      );
    }

    // 排序
    switch (sortBy) {
      case 'popular':
        return [...list].sort((a, b) => (b.installCount || 0) - (a.installCount || 0));
      case 'name':
        return [...list].sort((a, b) => a.name.localeCompare(b.name));
      case 'updated':
        // 按插件名排序作为后备
        return [...list].sort((a, b) => a.name.localeCompare(b.name));
      default:
        return list;
    }
  }, [categorizedPlugins, selectedCategory, searchQuery, sortBy]);

  // 分类统计
  const categoryCounts = useMemo(
    () => ({
      all: categorizedPlugins.all.length,
      installed: installed.length,
      mcp: categorizedPlugins.mcp.length,
      developer: categorizedPlugins.developer.length,
      git: categorizedPlugins.git.length,
      other: categorizedPlugins.other.length,
    }),
    [categorizedPlugins, installed]
  );

  // 处理安装
  const handleInstall = async () => {
    if (!selectedPlugin) return;
    const result = await installPlugin(selectedPlugin.id, selectedScope);
    if (result) {
      success(t('plugins.installSuccess', '插件安装成功'));
      selectPlugin(null);
    } else {
      toastError(t('plugins.installFailed', '插件安装失败'));
    }
    setShowConfirmModal(false);
    setConfirmAction(null);
  };

  // 处理启用/禁用
  const handleToggle = async (plugin: InstalledPlugin) => {
    const result = plugin.enabled
      ? await disablePlugin(plugin.id, plugin.scope as PluginScope)
      : await enablePlugin(plugin.id, plugin.scope as PluginScope);
    if (result) {
      success(
        plugin.enabled
          ? t('plugins.disableSuccess', '插件已禁用')
          : t('plugins.enableSuccess', '插件已启用')
      );
    }
  };

  // 处理更新
  const handleUpdate = async (plugin: InstalledPlugin) => {
    const result = await updatePlugin(plugin.id, plugin.scope as PluginScope);
    if (result) {
      success(t('plugins.updateSuccess', '插件更新成功'));
    }
  };

  // 处理卸载
  const handleUninstall = async () => {
    if (!selectedPlugin) return;
    const plugin = installed.find((p) => p.id === selectedPlugin.id);
    if (!plugin) return;
    const result = await uninstallPlugin(plugin.id, plugin.scope as PluginScope, false);
    if (result) {
      success(t('plugins.uninstallSuccess', '插件已卸载'));
    }
    setShowConfirmModal(false);
    setConfirmAction(null);
  };

  // 打开确认弹窗
  const openConfirmModal = (action: 'install' | 'uninstall') => {
    setConfirmAction(action);
    setShowConfirmModal(true);
  };

  // 选择插件
  const handleSelectPlugin = useCallback(
    (plugin: AvailablePlugin) => {
      if (installedIds.has(plugin.pluginId)) {
        selectInstalledPlugin(plugin.pluginId);
      } else {
        selectAvailablePlugin(plugin.pluginId);
      }
    },
    [installedIds, selectInstalledPlugin, selectAvailablePlugin]
  );

  // 刷新全部
  const handleRefreshAll = async () => {
    await Promise.all([fetchInstalled(), fetchAvailable(), fetchMarketplaces()]);
    success(t('plugins.refreshSuccess', '刷新成功'));
  };

  // 添加市场
  const handleAddMarket = async () => {
    if (!newMarketSource.trim()) return;
    setAddingMarket(true);
    const result = await addMarketplace(newMarketSource.trim());
    setAddingMarket(false);
    if (result) {
      success(t('plugins.addMarketSuccess', '市场添加成功'));
      setShowAddMarketModal(false);
      setNewMarketSource('');
      await fetchAvailable();
    }
  };

  // 删除市场
  const handleRemoveMarket = async (name: string) => {
    const result = await removeMarketplace(name);
    if (result) {
      success(t('plugins.removeMarketSuccess', '市场已删除'));
    }
  };

  // 刷新市场
  const handleUpdateMarket = async (name: string) => {
    setRefreshingMarket(name);
    const result = await updateMarketplace(name);
    setRefreshingMarket(null);
    if (result) {
      success(t('plugins.refreshMarketSuccess', '市场已刷新'));
      await fetchAvailable();
    }
  };

  return (
    <div className="flex h-[520px] gap-0 border border-border rounded-lg overflow-hidden">
      {/* 左侧：分类导航 */}
      <div className="w-36 flex-shrink-0 border-r border-border bg-surface flex flex-col">
        <div className="p-2 border-b border-border">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('plugins.search', '搜索...')}
            className="w-full bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-primary"
          />
        </div>

        <nav className="flex-1 overflow-y-auto py-1">
          {(Object.keys(CATEGORY_ICONS) as PluginCategory[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs transition-colors ${
                selectedCategory === cat
                  ? 'bg-primary/10 text-primary border-r-2 border-primary'
                  : 'text-text-secondary hover:bg-background hover:text-text-primary'
              }`}
            >
              <span className="flex items-center gap-2">
                <span>{CATEGORY_ICONS[cat]}</span>
                <span>{t(`plugins.category.${cat}`, cat)}</span>
              </span>
              <span className="text-text-muted">{categoryCounts[cat]}</span>
            </button>
          ))}
        </nav>

        {/* 市场管理入口 */}
        <div className="p-2 border-t border-border">
          <button
            onClick={() => setShowAddMarketModal(true)}
            className="w-full text-xs text-primary hover:underline text-center"
          >
            + {t('plugins.addMarket', '添加市场')}
          </button>
        </div>
      </div>

      {/* 中间：插件列表 */}
      <div className="w-56 flex-shrink-0 border-r border-border flex flex-col bg-background">
        {/* 排序栏 */}
        <div className="p-2 border-b border-border flex items-center justify-between">
          <span className="text-xs text-text-muted">
            {filteredPlugins.length} {t('plugins.items', '个')}
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="text-xs bg-transparent border-none text-text-secondary focus:outline-none cursor-pointer"
          >
            <option value="popular">{t('plugins.sort.popular', '热门')}</option>
            <option value="name">{t('plugins.sort.name', '名称')}</option>
          </select>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-hidden">
          {loading || availableLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <Virtuoso
              style={{ height: '100%' }}
              data={filteredPlugins}
              itemContent={(_index, plugin) => (
                <PluginListItem
                  plugin={plugin}
                  isInstalled={installedIds.has(plugin.pluginId)}
                  installedPlugin={installed.find((p) => p.id === plugin.pluginId)}
                  isSelected={selectedPlugin?.id === plugin.pluginId}
                  onClick={() => handleSelectPlugin(plugin)}
                />
              )}
              defaultItemHeight={48}
            />
          )}
        </div>
      </div>

      {/* 右侧：插件详情 */}
      <div className="flex-1 flex flex-col bg-background-elevated">
        {selectedPlugin ? (
          <>
            {/* 详情头部 */}
            <div className="p-4 border-b border-border">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-text-primary">{selectedPlugin.name}</h3>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-text-muted">{selectedPlugin.id}</span>
                    {selectedPlugin.installed && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          selectedPlugin.enabled
                            ? 'bg-green-500/10 text-green-500'
                            : 'bg-yellow-500/10 text-yellow-500'
                        }`}
                      >
                        {selectedPlugin.enabled
                          ? t('plugins.enabled', '已启用')
                          : t('plugins.disabled', '已禁用')}
                      </span>
                    )}
                    {selectedPlugin.installed && selectedPlugin.scope && (
                      <span className="text-xs px-1.5 py-0.5 bg-blue-500/10 text-blue-500 rounded">
                        {selectedPlugin.scope}
                      </span>
                    )}
                  </div>
                </div>
                {selectedPlugin.installCount !== undefined && (
                  <div className="text-right">
                    <div className="text-lg font-medium text-text-primary">
                      {formatInstallCount(selectedPlugin.installCount)}
                    </div>
                    <div className="text-xs text-text-muted">{t('plugins.installs', '安装')}</div>
                  </div>
                )}
              </div>
            </div>

            {/* 详情内容 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedPlugin.description && (
                <div>
                  <h4 className="text-xs font-medium text-text-secondary uppercase mb-1">
                    {t('plugins.description', '描述')}
                  </h4>
                  <p className="text-sm text-text-primary leading-relaxed">
                    {selectedPlugin.description}
                  </p>
                </div>
              )}

              {selectedPlugin.version && (
                <div className="flex gap-6">
                  <div>
                    <h4 className="text-xs font-medium text-text-secondary uppercase mb-1">
                      {t('plugins.version', '版本')}
                    </h4>
                    <p className="text-sm text-text-primary font-mono">{selectedPlugin.version}</p>
                  </div>
                  {selectedPlugin.marketplaceName && (
                    <div>
                      <h4 className="text-xs font-medium text-text-secondary uppercase mb-1">
                        {t('plugins.market', '市场')}
                      </h4>
                      <p className="text-sm text-text-primary">{selectedPlugin.marketplaceName}</p>
                    </div>
                  )}
                </div>
              )}

              {/* 已安装插件额外信息 */}
              {selectedPlugin.installed && (
                <div className="grid grid-cols-2 gap-4">
                  {selectedPlugin.installPath && (
                    <div className="col-span-2">
                      <h4 className="text-xs font-medium text-text-secondary uppercase mb-1">
                        {t('plugins.installPath', '安装路径')}
                      </h4>
                      <p className="text-xs text-text-primary font-mono break-all bg-surface p-2 rounded">
                        {selectedPlugin.installPath}
                      </p>
                    </div>
                  )}
                  {selectedPlugin.installedAt && (
                    <div>
                      <h4 className="text-xs font-medium text-text-secondary uppercase mb-1">
                        {t('plugins.installedAt', '安装时间')}
                      </h4>
                      <p className="text-sm text-text-primary">{formatDateTime(selectedPlugin.installedAt)}</p>
                    </div>
                  )}
                  {selectedPlugin.lastUpdated && (
                    <div>
                      <h4 className="text-xs font-medium text-text-secondary uppercase mb-1">
                        {t('plugins.lastUpdated', '更新时间')}
                      </h4>
                      <p className="text-sm text-text-primary">{formatDateTime(selectedPlugin.lastUpdated)}</p>
                    </div>
                  )}
                </div>
              )}

              {/* MCP 服务器配置 */}
              {selectedPlugin.mcpServers && Object.keys(selectedPlugin.mcpServers).length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-text-secondary uppercase mb-2">
                    {t('plugins.mcpServers', 'MCP 服务')}
                  </h4>
                  <div className="space-y-2">
                    {Object.entries(selectedPlugin.mcpServers).map(([name, config]) => (
                      <McpServerCard
                        key={name}
                        name={name}
                        config={config}
                        mcpType={t('plugins.mcpType', '类型')}
                        mcpUrl={t('plugins.mcpUrl', '地址')}
                        mcpCommand={t('plugins.mcpCommand', '命令')}
                      />
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-500 text-sm">
                  {error}
                  <button onClick={clearError} className="ml-2 underline">
                    {t('common.dismiss', '关闭')}
                  </button>
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="p-4 border-t border-border space-y-2">
              {selectedPlugin.installed ? (
                <>
                  <div className="flex gap-2">
                    <Button
                      variant={selectedPlugin.enabled ? 'secondary' : 'primary'}
                      onClick={() => {
                        const plugin = installed.find((p) => p.id === selectedPlugin.id);
                        if (plugin) handleToggle(plugin);
                      }}
                      disabled={operatingPluginId === selectedPlugin.id}
                      className="flex-1"
                    >
                      {selectedPlugin.enabled
                        ? t('plugins.disable', '禁用')
                        : t('plugins.enable', '启用')}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const plugin = installed.find((p) => p.id === selectedPlugin.id);
                        if (plugin) handleUpdate(plugin);
                      }}
                      disabled={operatingPluginId === selectedPlugin.id}
                      className="flex-1"
                    >
                      {t('plugins.update', '更新')}
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => openConfirmModal('uninstall')}
                    disabled={operatingPluginId === selectedPlugin.id}
                    className="w-full text-red-500 hover:bg-red-500/10"
                  >
                    {t('plugins.uninstall', '卸载')}
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => openConfirmModal('install')}
                  disabled={operatingPluginId === selectedPlugin.id}
                  className="w-full"
                >
                  {t('plugins.install', '安装')}
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-text-muted">
            <div className="text-4xl mb-2">📦</div>
            <div className="text-sm">{t('plugins.selectToView', '选择插件查看详情')}</div>
          </div>
        )}
      </div>

      {/* 确认弹窗 */}
      {showConfirmModal && selectedPlugin && (
        <ConfirmModal
          title={
            confirmAction === 'install'
              ? t('plugins.confirmInstall', '确认安装')
              : t('plugins.confirmUninstall', '确认卸载')
          }
          message={
            confirmAction === 'install'
              ? t('plugins.confirmInstallDesc', '确定要安装 {{name}} 吗？', {
                  name: selectedPlugin.name,
                })
              : t('plugins.confirmUninstallDesc', '确定要卸载 {{name}} 吗？', {
                  name: selectedPlugin.name,
                })
          }
          scope={selectedScope}
          onScopeChange={setSelectedScope}
          showScopeSelect={confirmAction === 'install'}
          onConfirm={confirmAction === 'install' ? handleInstall : handleUninstall}
          onCancel={() => {
            setShowConfirmModal(false);
            setConfirmAction(null);
          }}
          loading={operatingPluginId === selectedPlugin.id}
        />
      )}

      {/* 添加市场弹窗 */}
      {showAddMarketModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background-elevated rounded-lg p-6 max-w-md w-full mx-4 shadow-lg">
            <h3 className="text-lg font-medium text-text-primary mb-2">
              {t('plugins.addMarket', '添加市场')}
            </h3>
            <p className="text-sm text-text-secondary mb-4">
              {t('plugins.addMarketHint', '输入 GitHub 仓库（如 owner/repo）或 URL')}
            </p>
            <input
              type="text"
              value={newMarketSource}
              onChange={(e) => setNewMarketSource(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddMarket()}
              placeholder="owner/repo 或 https://..."
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary mb-4"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowAddMarketModal(false);
                  setNewMarketSource('');
                }}
              >
                {t('common.cancel', '取消')}
              </Button>
              <Button
                variant="primary"
                onClick={handleAddMarket}
                disabled={!newMarketSource.trim() || addingMarket}
              >
                {addingMarket ? t('common.processing', '处理中...') : t('common.confirm', '确认')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 市场列表弹窗（从分类导航触发） */}
      <MarketListModal
        marketplaces={marketplaces}
        onRefresh={handleRefreshAll}
        onAddMarket={() => setShowAddMarketModal(true)}
        onUpdateMarket={handleUpdateMarket}
        onRemoveMarket={handleRemoveMarket}
        refreshingMarket={refreshingMarket}
      />
    </div>
  );
}

// 插件列表项组件
const PluginListItem = memo<{
  plugin: AvailablePlugin;
  isInstalled: boolean;
  installedPlugin?: InstalledPlugin;
  isSelected: boolean;
  onClick: () => void;
}>(({ plugin, isInstalled, installedPlugin, isSelected, onClick }) => (
  <div
    onClick={onClick}
    className={`px-3 py-2 cursor-pointer transition-colors border-l-2 ${
      isSelected
        ? 'bg-primary/5 border-primary'
        : 'border-transparent hover:bg-surface'
    }`}
  >
    <div className="flex items-center justify-between mb-0.5">
      <span className="text-sm text-text-primary truncate font-medium">
        {plugin.name}
      </span>
      <div className="flex items-center gap-1 flex-shrink-0">
        {isInstalled && (
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              installedPlugin?.enabled ? 'bg-green-500' : 'bg-yellow-500'
            }`}
          />
        )}
        {plugin.installCount && (
          <span className="text-xs text-text-muted">
            {formatInstallCount(plugin.installCount)}
          </span>
        )}
      </div>
    </div>
    <div className="flex items-center gap-1">
      {isInstalled && installedPlugin?.scope && (
        <span className="text-xs px-1 bg-blue-500/10 text-blue-500 rounded">
          {installedPlugin.scope}
        </span>
      )}
      {isInstalled && !installedPlugin?.enabled && (
        <span className="text-xs px-1 bg-yellow-500/10 text-yellow-500 rounded">
          禁用
        </span>
      )}
    </div>
  </div>
));

PluginListItem.displayName = 'PluginListItem';

// 确认弹窗
function ConfirmModal({
  title,
  message,
  scope,
  onScopeChange,
  showScopeSelect,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string;
  message: string;
  scope: PluginScope;
  onScopeChange: (scope: PluginScope) => void;
  showScopeSelect: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation('settings');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background-elevated rounded-lg p-6 max-w-md w-full mx-4 shadow-lg">
        <h3 className="text-lg font-medium text-text-primary mb-2">{title}</h3>
        <p className="text-sm text-text-secondary mb-4">{message}</p>

        {showScopeSelect && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-text-secondary mb-2">
              {t('plugins.installScope', '安装范围')}
            </label>
            <div className="space-y-2">
              {(['user', 'project', 'local'] as PluginScope[]).map((s) => (
                <label key={s} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    value={s}
                    checked={scope === s}
                    onChange={() => onScopeChange(s)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-text-primary">
                    {t(`plugins.scope.${s}`, s)}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {t('common.cancel', '取消')}
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={loading}>
            {loading ? t('common.processing', '处理中...') : t('common.confirm', '确认')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// 市场列表弹窗（简化版，作为底部状态栏）
function MarketListModal({
  marketplaces,
  onRefresh,
  onUpdateMarket,
  onRemoveMarket,
  refreshingMarket,
}: {
  marketplaces: Array<{ name: string; repo?: string }>;
  onRefresh: () => void;
  onAddMarket: () => void;
  onUpdateMarket: (name: string) => void;
  onRemoveMarket: (name: string) => void;
  refreshingMarket: string | null;
}) {
  const { t } = useTranslation('settings');
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <div
        className="absolute bottom-0 left-0 right-0 bg-surface border-t border-border px-3 py-1.5 flex items-center justify-between cursor-pointer hover:bg-background transition-colors"
        style={{ left: '144px' }} // 左侧导航宽度
        onClick={() => setExpanded(true)}
      >
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>📁</span>
          <span>{t('plugins.marketplaces', '市场')}: {marketplaces.length}</span>
          {marketplaces.map((m) => (
            <span key={m.name} className="px-1.5 py-0.5 bg-border rounded text-text-primary">
              {m.name}
            </span>
          ))}
        </div>
        <span className="text-xs text-text-muted">▲</span>
      </div>
    );
  }

  return (
    <div
      className="absolute bottom-0 left-0 right-0 bg-surface border-t border-border shadow-lg"
      style={{ left: '144px' }}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="text-xs font-medium text-text-secondary">
          {t('plugins.marketplaces', '市场')}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="text-xs text-primary hover:underline"
          >
            {t('plugins.refreshAll', '刷新')}
          </button>
          <button
            onClick={() => setExpanded(false)}
            className="text-xs text-text-muted hover:text-text-primary"
          >
            ▼
          </button>
        </div>
      </div>
      <div className="px-3 py-2 flex flex-wrap gap-2">
        {marketplaces.map((m) => (
          <div
            key={m.name}
            className="flex items-center gap-2 text-xs bg-background px-2 py-1 rounded group"
          >
            <span className="text-text-primary font-medium">{m.name}</span>
            {m.repo && (
              <span className="text-text-muted">{m.repo}</span>
            )}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateMarket(m.name);
                }}
                disabled={refreshingMarket === m.name}
                className="text-text-muted hover:text-primary disabled:opacity-50"
              >
                ⟳
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveMarket(m.name);
                }}
                className="text-text-muted hover:text-red-500"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
