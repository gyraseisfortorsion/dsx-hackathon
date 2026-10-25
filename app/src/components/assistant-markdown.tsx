import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { openLink } from '@/utils/open-link';
import { AppText } from './app-text';
import { Timeline } from './timeline';

type Inline =
  | { type: 'text'; value: string }
  | { type: 'bold' | 'italic'; children: Inline[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; label: string };

type ClassMeeting = {
  time: string;
  start: string;
  title: string;
  href?: string;
  meeting?: string;
  location?: string;
  instructor?: string;
  tip?: string;
};

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'code'; value: string }
  | { type: 'hr' }
  | { type: 'schedule'; items: ClassMeeting[] };

const WEEKDAY = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i;
const TIME_RANGE = /(\d{1,2}:\d{2}\s*[AP]M)\s*[–—-]\s*(\d{1,2}:\d{2}\s*[AP]M)/i;
const LIST_MARK = /^(?:[-+*]|\d+\.|•)\s+/;
const HR = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const SECTION = /^(Class Schedule|Today'?s Schedule|Schedule)\s*:?\s*$/i;

/** Strips markdown so VoiceOver reads the reply, not the syntax. */
export function markdownPlainText(source: string) {
  return source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-+*]|\d+\.|•)\s+/gm, '')
    .replace(/^(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Renders assistant markdown as readable chat: headings, lists, links, and class timelines. */
export function AssistantMarkdown({
  text,
  color,
  linkColor,
  compact,
}: {
  text: string;
  color: string;
  linkColor: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <AppText selectable style={{ fontSize: 15, lineHeight: 21, color }}>
        <InlineNodes nodes={parseInline(text)} color={color} linkColor={linkColor} />
      </AppText>
    );
  }

  const blocks = parseBlocks(text);
  return (
    <View style={{ gap: spacing.sm }}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} color={color} linkColor={linkColor} />
      ))}
    </View>
  );
}

function BlockView({ block, color, linkColor }: { block: Block; color: string; linkColor: string }) {
  if (block.type === 'hr') {
    return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginVertical: spacing.xs }} />;
  }
  if (block.type === 'heading') {
    return (
      <AppText selectable variant={block.level === 1 ? 'heading' : 'headline'} style={{ color, marginTop: block.level === 1 ? spacing.xs : 0 }}>
        <InlineNodes nodes={block.children} color={color} linkColor={linkColor} />
      </AppText>
    );
  }
  if (block.type === 'code') {
    return (
      <View style={{ backgroundColor: colors.surfaceMuted, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
        <AppText selectable style={{ fontSize: 13, lineHeight: 18, color: colors.ink }}>
          {block.value}
        </AppText>
      </View>
    );
  }
  if (block.type === 'list') {
    return (
      <View style={{ gap: 6 }}>
        {block.items.map((item, index) => (
          <View key={index} style={{ flexDirection: 'row', gap: 8, paddingRight: spacing.xs }}>
            <AppText style={{ fontSize: 15, lineHeight: 21, color, width: 16 }}>{block.ordered ? `${index + 1}.` : '•'}</AppText>
            <AppText selectable style={{ flex: 1, fontSize: 15, lineHeight: 21, color }}>
              <InlineNodes nodes={item} color={color} linkColor={linkColor} />
            </AppText>
          </View>
        ))}
      </View>
    );
  }
  if (block.type === 'schedule') {
    return (
      <View style={{ paddingTop: spacing.xs, paddingBottom: 2 }}>
        <Timeline
          entries={block.items.map((item, index) => ({
            key: `${item.start}-${item.title}-${index}`,
            time: item.start,
            title: item.title,
            subtitle: [item.time, item.meeting, item.location, item.instructor].filter(Boolean).join(' · '),
            note: item.tip,
            onPress: item.href ? () => openLink(item.href!) : undefined,
          }))}
        />
      </View>
    );
  }
  return (
    <AppText selectable style={{ fontSize: 15, lineHeight: 21, color }}>
      <InlineNodes nodes={block.children} color={color} linkColor={linkColor} />
    </AppText>
  );
}

function InlineNodes({ nodes, color, linkColor }: { nodes: Inline[]; color: string; linkColor: string }) {
  return nodes.map((node, index) => {
    if (node.type === 'text') return <Fragment key={index}>{node.value}</Fragment>;
    if (node.type === 'code') {
      return (
        <AppText key={index} style={{ fontSize: 13, lineHeight: 21, color, backgroundColor: colors.surfaceMuted }}>
          {node.value}
        </AppText>
      );
    }
    if (node.type === 'link') {
      return (
        <AppText key={index} accessibilityRole="link" onPress={() => openLink(node.href)} style={{ fontSize: 15, lineHeight: 21, color: linkColor, fontWeight: '600' }}>
          {node.label}
        </AppText>
      );
    }
    return (
      <AppText
        key={index}
        style={{
          fontSize: 15,
          lineHeight: 21,
          color,
          fontWeight: node.type === 'bold' ? '700' : '400',
          fontStyle: node.type === 'italic' ? 'italic' : 'normal',
        }}>
        <InlineNodes nodes={node.children} color={color} linkColor={linkColor} />
      </AppText>
    );
  });
}

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const raw: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let fence: string[] | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    raw.push(blockFromPlain(paragraph.join('\n').trim()));
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    raw.push({ type: 'list', ordered: list.ordered, items: list.items.map(parseInline) });
    list = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (fence) {
      if (trimmed.startsWith('```')) {
        raw.push({ type: 'code', value: fence.join('\n') });
        fence = null;
      } else {
        fence.push(line);
      }
      continue;
    }
    if (trimmed.startsWith('```')) {
      flushParagraph();
      flushList();
      fence = [];
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    if (HR.test(trimmed)) {
      flushParagraph();
      flushList();
      raw.push({ type: 'hr' });
      continue;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      raw.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, children: parseInline(heading[2]) });
      continue;
    }
    const listed = trimmed.match(LIST_MARK);
    if (listed) {
      flushParagraph();
      const ordered = /^\d+\./.test(trimmed);
      const body = trimmed.replace(LIST_MARK, '');
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [body] };
      } else {
        list.items.push(body);
      }
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();
  if (fence?.length) raw.push({ type: 'code', value: fence.join('\n') });

  return promoteSchedule(raw);
}

function blockFromPlain(text: string): Block {
  const cleaned = text.replace(/:$/, '');
  if (WEEKDAY.test(text) || SECTION.test(cleaned)) {
    return { type: 'heading', level: WEEKDAY.test(text) ? 1 : 3, children: parseInline(cleaned) };
  }
  return { type: 'paragraph', children: parseInline(text) };
}

function promoteSchedule(blocks: Block[]): Block[] {
  const out: Block[] = [];
  let schedule: ClassMeeting[] = [];

  const flushSchedule = () => {
    if (!schedule.length) return;
    out.push({ type: 'schedule', items: schedule });
    schedule = [];
  };

  const takePlain = (nodes: Inline[]) => flattenInline(nodes).trim();

  for (const block of blocks) {
    if (block.type === 'hr' && schedule.length) continue;
    if (block.type === 'paragraph' || block.type === 'heading') {
      const plain = takePlain(block.children);
      const meeting = parseClassLine(plain);
      if (meeting) {
        schedule.push(meeting);
        continue;
      }
      const tip = parseTip(plain);
      if (tip && schedule.length) {
        schedule[schedule.length - 1].tip = tip;
        continue;
      }
      flushSchedule();
      out.push(block);
      continue;
    }
    if (block.type === 'list') {
      for (const item of block.items) {
        const plain = takePlain(item);
        const meeting = parseClassLine(plain);
        if (meeting) {
          schedule.push(meeting);
          continue;
        }
        const tip = parseTip(plain);
        if (tip && schedule.length) {
          schedule[schedule.length - 1].tip = tip;
          continue;
        }
        flushSchedule();
        out.push({ type: 'list', ordered: block.ordered, items: [item] });
      }
      continue;
    }
    flushSchedule();
    out.push(block);
  }
  flushSchedule();
  return out;
}

function parseClassLine(raw: string): ClassMeeting | null {
  const text = raw.replace(/^(?:Class Schedule|Schedule)\s*[·•|:]\s*/i, '').trim();
  const time = text.match(TIME_RANGE);
  if (!time || time.index == null) return null;
  const after = text.slice(time.index + time[0].length).trim();
  if (!after.startsWith('|') && !after.startsWith('·') && !after.startsWith('•') && !/\[[^\]]+\]\([^)]+\)/.test(after)) return null;

  const rest = after.replace(/^[|·•]\s*/, '');
  const link = rest.match(/\[([^\]]+)\]\((https?:[^)\s]+)\)/);
  const meeting = rest.match(/\(([^)]*(?:Lecture|Discussion|Lab|Seminar|Recitation)[^)]*)\)/i)?.[1]?.trim();
  const location = rest.match(/Location:\s*([^·•*(]+)/i)?.[1]?.trim();
  const instructor = rest.match(/Instructor[s]?:\s*([^)*]+)/i)?.[1]?.trim();
  const title = (link?.[1] ?? rest.split(/[·•]|\*(?:Instructor)/i)[0].replace(/\([^)]*\)/g, '')).replace(/\s+/g, ' ').trim();
  if (!title) return null;

  return {
    time: `${time[1]} – ${time[2]}`.replace(/\s+/g, ' '),
    start: time[1].replace(/\s*[AP]M/i, ''),
    title,
    href: link?.[2],
    meeting,
    location,
    instructor,
  };
}

function parseTip(raw: string) {
  const match = raw.match(/^\*{0,2}Tip:?\*{0,2}:?\s+(.+)$/i);
  return match ? match[1].replace(/\*+/g, '').trim() : null;
}

function flattenInline(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text' || node.type === 'code') return node.value;
      if (node.type === 'link') return `[${node.label}](${node.href})`;
      return flattenInline(node.children);
    })
    .join('');
}

function parseInline(source: string): Inline[] {
  const nodes: Inline[] = [];
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('**', index)) {
      const end = source.indexOf('**', index + 2);
      if (end !== -1) {
        nodes.push({ type: 'bold', children: parseInline(source.slice(index + 2, end)) });
        index = end + 2;
        continue;
      }
    }
    if (source[index] === '[') {
      const link = source.slice(index).match(/^\[([^\]]+)\]\((https?:[^)\s]+)\)/);
      if (link) {
        nodes.push({ type: 'link', label: link[1], href: link[2] });
        index += link[0].length;
        continue;
      }
    }
    if (source[index] === '*' || source[index] === '_') {
      const marker = source[index];
      if (source[index + 1] !== marker) {
        const end = source.indexOf(marker, index + 1);
        if (end !== -1 && source[end + 1] !== marker) {
          nodes.push({ type: 'italic', children: parseInline(source.slice(index + 1, end)) });
          index = end + 1;
          continue;
        }
      }
    }
    if (source[index] === '`') {
      const end = source.indexOf('`', index + 1);
      if (end !== -1) {
        nodes.push({ type: 'code', value: source.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }
    let next = index + 1;
    while (next < source.length && !'*_`['.includes(source[next])) next += 1;
    nodes.push({ type: 'text', value: source.slice(index, next) });
    index = next;
  }
  return nodes;
}
