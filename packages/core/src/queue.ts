/**
 * 队列抽象。v0.1 的实现是 pg-boss（只依赖 Postgres）；
 * 以后量大了可以在这个接口下换成 BullMQ + Redis。
 */
export const QUEUES = {
  botRun: "bot.run",
  routineTick: "routine.tick",
} as const;

export interface BotRunJob {
  runId: string;
  botId: string;
  workspaceId: string;
  /** 本次运行临时提供的输入（覆盖 Bot 的默认输入） */
  inputs?: Record<string, unknown>;
}

export interface RoutineTickJob {
  routineId: string;
}

export interface Queue {
  send<T extends object>(name: string, data: T): Promise<string | null>;
}
