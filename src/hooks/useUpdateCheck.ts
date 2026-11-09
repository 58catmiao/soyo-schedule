import { useCallback, useEffect, useState } from 'react';
import Constants from 'expo-constants';
import {
  AUTO_CHECK_INTERVAL_MS,
  type UpdateInfo,
  type UpdateStatus,
  fetchLatestRelease,
  readLastCheck,
  writeLastCheck,
} from '../updater';

/**
 * 应用内更新：启动时最多每 6 小时查一次 GitHub 上的最新 release，
 * 设置页也能手动点。只提示 + 打开下载地址，装包交给系统。
 */
export function useUpdateCheck() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [status, setStatus] = useState<UpdateStatus>('idle');

  const check = useCallback(async (manual: boolean) => {
    const current = Constants.expoConfig?.version ?? '0.0.0';
    if (!manual) {
      const last = await readLastCheck();
      if (Date.now() - last < AUTO_CHECK_INTERVAL_MS) return;
    }
    setStatus('checking');
    try {
      const latest = await fetchLatestRelease(current);
      await writeLastCheck(Date.now());
      setInfo(latest);
      setStatus(latest ? 'available' : 'latest');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void check(false);
  }, [check]);

  return { updateInfo: info, updateStatus: status, checkUpdate: check };
}
