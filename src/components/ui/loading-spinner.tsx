export default function LoadingSpinner({ message }: { message?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
      {/* 旋轉動畫 */}
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-gray-200" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-accent animate-spin" />
      </div>
      {message && (
        <p className="text-sm text-muted animate-pulse">{message}</p>
      )}
    </div>
  );
}
