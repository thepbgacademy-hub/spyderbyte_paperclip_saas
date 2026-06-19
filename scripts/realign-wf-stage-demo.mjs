import { generateStageDemoRealignmentSql } from "./lib/wf-stage-demo-realignment.mjs";

process.stdout.write(`${generateStageDemoRealignmentSql()}\n`);
