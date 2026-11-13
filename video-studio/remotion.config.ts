/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import path from "node:path";
import { Config } from "@remotion/cli/config";

Config.setRspack(true);
// Agent-built compositions live in each project's job folder (outside this folder in the installed app):
// let them import remotion, React and the fonts installed here.
Config.overrideWebpackConfig((c) => ({
  ...c,
  resolve: {...c.resolve, modules: [...((c.resolve && c.resolve.modules) || ["node_modules"]), path.join(process.cwd(), "node_modules")]},
}));
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);
