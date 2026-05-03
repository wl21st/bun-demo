import React, { useState, useEffect, useCallback, useRef } from "react";
import { render, Box, Text, useApp } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { loadConfig } from "./config";
import { runAgent, createAgentController } from "./run-agent";
import type { AgentEvent, AgentController } from "./run-agent";
import { parseTaskArg, parseCommand } from "./commands";
import type { Command } from "./commands";
import type { Observation } from "./types";

// ── Types ──────────────────────────────────────────────────────────────────

type AppStatus = "running" | "paused" | "failed" | "finished";

type CompletedStep = {
    stepNumber: number;
    tool: string;
    observation: Observation;
};

type HistoryEntry =
    | { kind: "step"; step: CompletedStep }
    | { kind: "separator"; label: string };

// ── Child components ───────────────────────────────────────────────────────

function TaskHeader({ task, model }: { task: string; model: string }) {
    return (
        <Box borderStyle="single" paddingX={1}>
            <Text bold>Task: </Text>
            <Text>{task}</Text>
            <Text dimColor>{"  [model: " + model + "]"}</Text>
        </Box>
    );
}

function CurrentStep({
    stepNumber,
    tool,
    input,
    done,
    ok,
    verbose,
    status,
}: {
    stepNumber: number | null;
    tool: string | null;
    input: unknown;
    done: boolean;
    ok: boolean | null;
    verbose: boolean;
    status: AppStatus;
}) {
    if (stepNumber === null || tool === null) {
        return (
            <Box paddingX={1}>
                <Text dimColor>Waiting to start…</Text>
            </Box>
        );
    }

    const inputStr = JSON.stringify(input);
    const displayInput = verbose ? inputStr : inputStr.slice(0, 200);

    const indicator = done
        ? ok
            ? <Text color="green">✓</Text>
            : <Text color="red">✗</Text>
        : status === "paused"
        ? <Text color="yellow">⏸</Text>
        : <Text color="green"><Spinner type="dots" /></Text>;

    return (
        <Box paddingX={1} flexDirection="column">
            <Box gap={1}>
                {indicator}
                <Text bold>Step {stepNumber}</Text>
                <Text color="cyan">{tool}</Text>
            </Box>
            <Text dimColor>{"  " + displayInput}</Text>
        </Box>
    );
}

function StepHistory({ entries, verbose }: { entries: HistoryEntry[]; verbose: boolean }) {
    if (entries.length === 0) return null;
    return (
        <Box flexDirection="column" paddingX={1}>
            <Text dimColor bold>History</Text>
            {entries.map((entry, i) => {
                if (entry.kind === "separator") {
                    return <Text key={i} dimColor>── {entry.label} ──</Text>;
                }
                const { step } = entry;
                const inputStr = JSON.stringify(step.observation.output);
                const display = verbose ? inputStr : inputStr.slice(0, 80);
                return (
                    <Box key={i} gap={1}>
                        <Text color={step.observation.ok ? "green" : "red"}>
                            {step.observation.ok ? "✓" : "✗"}
                        </Text>
                        <Text dimColor>Step {step.stepNumber}</Text>
                        <Text color="cyan">{step.tool}</Text>
                        <Text dimColor>{display}</Text>
                    </Box>
                );
            })}
        </Box>
    );
}

function QueuePanel({ queue }: { queue: string[] }) {
    if (queue.length === 0) return null;
    return (
        <Box flexDirection="column" paddingX={1} borderStyle="single">
            <Text bold>Queue [{queue.length} pending]</Text>
            {queue.map((t, i) => (
                <Text key={i} dimColor>· {t}</Text>
            ))}
        </Box>
    );
}

function FinalOutput({ event }: { event: (AgentEvent & { kind: "agent_finished" | "agent_failed" }) | null }) {
    if (!event) return null;
    if (event.kind === "agent_finished") {
        return (
            <Box paddingX={1} borderStyle="single">
                <Text color="green" bold>✓ Done: </Text>
                <Text>{event.message}</Text>
            </Box>
        );
    }
    return (
        <Box paddingX={1} borderStyle="single">
            <Text color="red" bold>✗ Failed ({event.reason}): </Text>
            <Text>{event.message}</Text>
        </Box>
    );
}

function HelpPanel() {
    return (
        <Box flexDirection="column" paddingX={1} borderStyle="single">
            <Text bold>Commands</Text>
            <Text dimColor>/abort    — stop current run (or exit after failure)</Text>
            <Text dimColor>/pause    — pause after current step</Text>
            <Text dimColor>/resume   — resume a paused run</Text>
            <Text dimColor>/skip     — skip failed task, advance queue</Text>
            <Text dimColor>/add &lt;task&gt; — enqueue a follow-up task</Text>
            <Text dimColor>/model &lt;n&gt;  — set model for queued tasks</Text>
            <Text dimColor>/verbose  — toggle full tool input display</Text>
            <Text dimColor>/clear    — clear history display</Text>
            <Text dimColor>/help     — show this panel</Text>
        </Box>
    );
}

function CommandBar({
    onCommand,
    error,
}: {
    onCommand: (cmd: Command) => void;
    error: string | null;
}) {
    const [value, setValue] = useState("");

    const handleSubmit = useCallback(
        (val: string) => {
            setValue("");
            if (val.trim()) onCommand(parseCommand(val.trim()));
        },
        [onCommand],
    );

    return (
        <Box flexDirection="column" paddingX={1}>
            {error && <Text color="red">{error}</Text>}
            <Box gap={1}>
                <Text dimColor>{">"}</Text>
                <TextInput
                    value={value}
                    onChange={setValue}
                    onSubmit={handleSubmit}
                    showCursor
                    focus
                    placeholder="/help for commands"
                />
            </Box>
        </Box>
    );
}

// ── App ────────────────────────────────────────────────────────────────────

type AppProps = {
    initialTask: string;
    initialModel: string;
    initialVerbose: boolean;
};

function App({ initialTask, initialModel, initialVerbose }: AppProps) {
    const { exit } = useApp();

    const [currentTask, setCurrentTask] = useState(initialTask);
    const [queue, setQueue] = useState<string[]>([]);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [model, setModel] = useState(initialModel);
    const [verbose, setVerbose] = useState(initialVerbose);
    const [status, setStatus] = useState<AppStatus>("running");
    const [helpVisible, setHelpVisible] = useState(false);
    const [commandError, setCommandError] = useState<string | null>(null);
    const [finalEvent, setFinalEvent] = useState<(AgentEvent & { kind: "agent_finished" | "agent_failed" }) | null>(null);

    // Current in-progress step display state
    const [currentStepNumber, setCurrentStepNumber] = useState<number | null>(null);
    const [currentTool, setCurrentTool] = useState<string | null>(null);
    const [currentInput, setCurrentInput] = useState<unknown>(null);
    const [currentDone, setCurrentDone] = useState(false);
    const [currentOk, setCurrentOk] = useState<boolean | null>(null);

    const controllerRef = useRef<AgentController | null>(null);
    // Tracks the model at run-start so /model mid-run only affects queued tasks
    const runConfigRef = useRef({ model: initialModel });

    const startRun = useCallback(
        (task: string, runModel: string) => {
            const controller = createAgentController();
            controllerRef.current = controller;
            runConfigRef.current = { model: runModel };
            setCurrentStepNumber(null);
            setCurrentTool(null);
            setCurrentInput(null);
            setCurrentDone(false);
            setCurrentOk(null);
            setFinalEvent(null);
            setStatus("running");

            const config = { ...loadConfig(), model: runModel };

            runAgent(task, config, (event) => {
                switch (event.kind) {
                    case "step_start":
                        setCurrentStepNumber(event.stepNumber);
                        setCurrentTool(event.tool);
                        setCurrentInput(event.input);
                        setCurrentDone(false);
                        setCurrentOk(null);
                        break;
                    case "step_done":
                        setCurrentDone(true);
                        setCurrentOk(event.observation.ok);
                        setHistory(prev => [
                            ...prev,
                            { kind: "step", step: { stepNumber: event.stepNumber, tool: event.tool, observation: event.observation } },
                        ]);
                        break;
                    case "agent_finished":
                        setFinalEvent(event);
                        setStatus("finished");
                        setQueue(prev => {
                            if (prev.length > 0) {
                                const [next, ...rest] = prev;
                                // auto-advance: append separator then start next run
                                setHistory(h => [...h, { kind: "separator", label: `─ ${task} ✓ ─` }]);
                                setCurrentTask(next!);
                                // use latest model state at advance time
                                setTimeout(() => startRun(next!, model), 0);
                                return rest;
                            }
                            // queue empty — exit cleanly
                            setTimeout(() => exit(), 100);
                            return prev;
                        });
                        break;
                    case "agent_failed":
                        setFinalEvent(event);
                        setStatus("failed");
                        // do NOT auto-advance; wait for /skip or /abort
                        break;
                }
            }, controller);
        },
        [exit, model],
    );

    // Start the initial run on mount
    useEffect(() => {
        startRun(initialTask, initialModel);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleCommand = useCallback(
        (cmd: Command) => {
            switch (cmd.kind) {
                case "abort":
                    if (status === "running" || status === "paused") {
                        controllerRef.current?.abort();
                    } else if (status === "failed") {
                        setQueue([]);
                        exit(new Error("aborted"));
                    }
                    break;
                case "pause":
                    if (status === "running") {
                        controllerRef.current?.pause();
                        setStatus("paused");
                    }
                    break;
                case "resume":
                    if (status === "paused") {
                        controllerRef.current?.resume();
                        setStatus("running");
                    }
                    break;
                case "skip":
                    if (status === "failed") {
                        setQueue(prev => {
                            if (prev.length === 0) return prev;
                            const [next, ...rest] = prev;
                            setHistory(h => [...h, { kind: "separator", label: `─ skipped ─` }]);
                            setCurrentTask(next!);
                            setTimeout(() => startRun(next!, model), 0);
                            return rest;
                        });
                    }
                    break;
                case "verbose":
                    setVerbose(v => !v);
                    break;
                case "clear":
                    setHistory([]);
                    break;
                case "model":
                    setModel(cmd.name);
                    break;
                case "add":
                    setQueue(prev => [...prev, cmd.task]);
                    break;
                case "help":
                    setHelpVisible(v => !v);
                    break;
                case "unknown":
                    setCommandError(`Unknown command: ${cmd.input}`);
                    setTimeout(() => setCommandError(null), 3000);
                    break;
            }
        },
        [status, exit, startRun, model],
    );

    return (
        <Box flexDirection="column">
            <TaskHeader task={currentTask} model={model} />
            <CurrentStep
                stepNumber={currentStepNumber}
                tool={currentTool}
                input={currentInput}
                done={currentDone}
                ok={currentOk}
                verbose={verbose}
                status={status}
            />
            <StepHistory entries={history} verbose={verbose} />
            <QueuePanel queue={queue} />
            {finalEvent && <FinalOutput event={finalEvent} />}
            {helpVisible && <HelpPanel />}
            <CommandBar onCommand={handleCommand} error={commandError} />
        </Box>
    );
}

// ── Entry point ────────────────────────────────────────────────────────────

const rawArg = process.argv.slice(2).join(" ").trim();

if (!rawArg) {
    console.error("Usage: bun run tui \"<task>\"");
    process.exit(1);
}

const { task, flags } = parseTaskArg(rawArg);

if (!task) {
    console.error("Usage: bun run tui \"<task>\"");
    process.exit(1);
}

const baseConfig = loadConfig();

render(
    <App
        initialTask={task}
        initialModel={flags.model ?? baseConfig.model}
        initialVerbose={flags.verbose ?? false}
    />,
);
