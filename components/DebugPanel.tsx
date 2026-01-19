import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';

interface LogEntry {
  id: number;
  timestamp: string;
  message: string;
  type: 'log' | 'warn' | 'error';
}

let logEntries: LogEntry[] = [];
let logId = 0;
let listeners: Array<() => void> = [];

const addLog = (message: string, type: 'log' | 'warn' | 'error' = 'log') => {
  const entry: LogEntry = {
    id: logId++,
    timestamp: new Date().toLocaleTimeString(),
    message,
    type,
  };
  logEntries.push(entry);
  // Manter apenas os últimos 50 logs
  if (logEntries.length > 50) {
    logEntries = logEntries.slice(-50);
  }
  listeners.forEach(listener => listener());
};

// Interceptar console.log, console.warn, console.error
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args: any[]) => {
  originalLog(...args);
  addLog(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '), 'log');
};

console.warn = (...args: any[]) => {
  originalWarn(...args);
  addLog(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '), 'warn');
};

console.error = (...args: any[]) => {
  originalError(...args);
  addLog(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '), 'error');
};

interface DebugPanelProps {
  visible?: boolean;
}

export default function DebugPanel({ visible = false }: DebugPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const updateLogs = () => {
      setLogs([...logEntries]);
    };
    
    listeners.push(updateLogs);
    updateLogs();

    return () => {
      listeners = listeners.filter(l => l !== updateLogs);
    };
  }, []);

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
      >
        <Text style={styles.headerText}>
          📊 Debug Logs ({logs.length})
        </Text>
        <Text style={styles.toggleText}>{isExpanded ? '▼' : '▲'}</Text>
      </TouchableOpacity>
      
      {isExpanded && (
        <ScrollView style={styles.logsContainer} nestedScrollEnabled>
          {logs.length === 0 ? (
            <Text style={styles.emptyText}>Nenhum log ainda</Text>
          ) : (
            logs.map(log => (
              <View key={log.id} style={[styles.logEntry, styles[log.type]]}>
                <Text style={styles.timestamp}>{log.timestamp}</Text>
                <Text style={styles.logText}>{log.message}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 320,
    right: 10,
    width: 300,
    maxHeight: 400,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 8,
    zIndex: 9999,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  headerText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  toggleText: {
    color: '#fff',
    fontSize: 12,
  },
  logsContainer: {
    maxHeight: 350,
  },
  logEntry: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  log: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  warn: {
    backgroundColor: 'rgba(255, 193, 7, 0.2)',
  },
  error: {
    backgroundColor: 'rgba(244, 67, 54, 0.2)',
  },
  timestamp: {
    color: '#888',
    fontSize: 10,
    marginBottom: 2,
  },
  logText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  emptyText: {
    color: '#888',
    padding: 20,
    textAlign: 'center',
  },
});

