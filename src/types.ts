export type Config = {
    apiKey: string;
    baseURL: string | undefined;
    model: string;
    maxSteps: number;
};

export type AgentStep =
    | {
        tool: "listFiles";
        input: {
            dir: string;
        };
    }
    | {
        tool: "readFile";
        input: {
            path: string;
        };
    }
    | {
        tool: "writeFile";
        input: {
            path: string;
            content: string;
        };
    }
    | {
        tool: "shell";
        input: {
            command: string;
        };
    }
    | {
        tool: "test";
        input: {};
    }
    | {
        tool: "finish";
        input: {
            message: string;
        };
    };

export type Observation = {
    ok: boolean;
    output: string;
};