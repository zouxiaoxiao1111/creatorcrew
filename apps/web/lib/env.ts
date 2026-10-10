import "server-only";
import { parseEnv } from "@creatorcrew/config";
import { getFeatures } from "@creatorcrew/core";

export function serverEnv() {
  return parseEnv(process.env);
}

export function features() {
  return getFeatures(process.env);
}
