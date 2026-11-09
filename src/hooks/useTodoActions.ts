import { useState } from 'react';
import type { AppData, Todo } from '../types';
import { toISODate } from '../schedule';

/**
 * 待办表单的开关与增删改。数据本身还在 App 的 AppData 里，
 * 这里只负责「哪一条、哪一天、表单开没开」。
 */
export function useTodoActions(commit: (updater: (prev: AppData) => AppData) => void) {
  const [todoSheetVisible, setTodoSheetVisible] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [todoDate, setTodoDate] = useState(() => toISODate(new Date()));

  /** 新建；给了日期就落在那一天（课表空白格传进来） */
  const openNewTodo = (date?: string) => {
    setEditingTodo(null);
    setTodoDate(date ?? toISODate(new Date()));
    setTodoSheetVisible(true);
  };

  const openTodo = (todo: Todo) => {
    setEditingTodo(todo);
    setTodoDate(todo.date);
    setTodoSheetVisible(true);
  };

  const closeTodoSheet = () => {
    setTodoSheetVisible(false);
    setEditingTodo(null);
  };

  const saveTodo = (todo: Todo) => {
    commit((prev) => {
      const todos = prev.todos ?? [];
      const exists = todos.some((t) => t.id === todo.id);
      return {
        ...prev,
        todos: exists ? todos.map((t) => (t.id === todo.id ? todo : t)) : [...todos, todo],
      };
    });
    setTodoSheetVisible(false);
    setEditingTodo(null);
  };

  const toggleTodo = (id: string) => {
    commit((prev) => ({
      ...prev,
      todos: (prev.todos ?? []).map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    }));
  };

  const deleteTodo = (id: string) => {
    commit((prev) => ({ ...prev, todos: (prev.todos ?? []).filter((t) => t.id !== id) }));
    setTodoSheetVisible(false);
    setEditingTodo(null);
  };

  return {
    todoSheetVisible,
    editingTodo,
    todoDate,
    openNewTodo,
    openTodo,
    closeTodoSheet,
    saveTodo,
    toggleTodo,
    deleteTodo,
  };
}
