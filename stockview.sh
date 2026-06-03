#!/bin/bash

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_PID="$APP_DIR/.server.pid"
CLIENT_PID="$APP_DIR/.client.pid"
LOG_DIR="$APP_DIR/logs"
SERVER_LOG="$LOG_DIR/server.log"
CLIENT_LOG="$LOG_DIR/client.log"

mkdir -p "$LOG_DIR"

get_pid() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null && cat "$1"; }

start_server() {
    pid=$(get_pid "$SERVER_PID")
    [ -n "$pid" ] && echo "后端已在运行 (PID: $pid)" && return
    cd "$APP_DIR/server"
    nohup npx tsx watch src/index.ts >> "$SERVER_LOG" 2>&1 &
    echo $! > "$SERVER_PID"
    echo "后端启动成功 (PID: $!)"
}

start_client() {
    pid=$(get_pid "$CLIENT_PID")
    [ -n "$pid" ] && echo "前端已在运行 (PID: $pid)" && return
    cd "$APP_DIR/client"
    nohup npx vite --host >> "$CLIENT_LOG" 2>&1 &
    echo $! > "$CLIENT_PID"
    echo "前端启动成功 (PID: $!)"
}

stop_server() {
    pid=$(get_pid "$SERVER_PID")
    [ -z "$pid" ] && echo "后端未运行" && return
    kill "$pid" 2>/dev/null
    rm -f "$SERVER_PID"
    echo "后端已停止"
}

stop_client() {
    pid=$(get_pid "$CLIENT_PID")
    [ -z "$pid" ] && echo "前端未运行" && return
    kill "$pid" 2>/dev/null
    rm -f "$CLIENT_PID"
    echo "前端已停止"
}

case "$1" in
    start)
        start_server
        start_client
        ;;
    stop)
        stop_server
        stop_client
        ;;
    restart)
        $0 stop
        sleep 1
        $0 start
        ;;
    status)
        pid=$(get_pid "$SERVER_PID")
        if [ -n "$pid" ]; then echo "后端: 运行中 (PID: $pid)"; else echo "后端: 未运行"; fi
        pid=$(get_pid "$CLIENT_PID")
        if [ -n "$pid" ]; then echo "前端: 运行中 (PID: $pid)"; else echo "前端: 未运行"; fi
        ;;
    logs)
        tail -f "$SERVER_LOG" "$CLIENT_LOG"
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status|logs}"
        ;;
esac
