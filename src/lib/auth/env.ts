/**
 * 是否啟用「免驗證」放行（本機／開發用）。
 *
 * 條件：非 production，或明確設定 LOCAL_NO_AUTH="true"（本機 Docker 用）。
 * 正式站（NODE_ENV=production 且未設此旗標）一律回 false，確保安全。
 */
export function isAuthBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.LOCAL_NO_AUTH === "true"
  );
}
