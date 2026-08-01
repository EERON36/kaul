import type { NextConfig } from "next";

import { parseEnvironment } from "./src/lib/environment";

parseEnvironment(process.env);

const nextConfig: NextConfig = {};

export default nextConfig;
