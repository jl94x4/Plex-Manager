/** True while still transferring or waiting to download — false for completed/seeding/uploading. */
export const isActiveDownloadItem = (item: any) => {
    const state = String(item?.state || '').toLowerCase();
    const progress = Number(item?.progress) || 0;
    if (/(seed|upload|complet|done|finished)/.test(state) && !/(download|meta|allocat|mov)/.test(state)) {
        return false;
    }
    if (/(stalledup|queuedup|pausedup|forcedup|checkingup)\b/.test(state)) return false;
    if (progress >= 99.5) {
        if (/(download|dl|meta|allocat|mov|queuedl|pausedl|forcedl|checkingdl|stalleddl)\b/.test(state)) return true;
        return false;
    }
    return true;
};
