import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-xl font-semibold tracking-tight">CreatorCrew</div>
          <div className="text-sm text-zinc-500">你的 AI 编辑部</div>
        </div>
        {children}
      </div>
    </div>
  );
}
