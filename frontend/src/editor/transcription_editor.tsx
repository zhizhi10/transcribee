import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createEditor, Descendant } from 'slate';
import { withReact, Slate, Editable, RenderElementProps, RenderLeafProps } from 'slate-react';
import * as Automerge from '@automerge/automerge';
import { withAutomergeDoc } from 'slate-automerge-doc';
import { AutomergeWebsocketProvider } from './automerge_websocket_provider';
import { useDebugMode } from '../debugMode';

import { Document, Paragraph, TextClickEvent } from './types';
import { SecondaryButton } from '../components/button';
import { generateWebVtt } from '../utils/export/webvtt';
import { downloadTextAsFile } from '../utils/download_text_as_file';
import { PlayerBar, startTimeToClassName } from './player';
import { useLocation } from 'wouter';

const LazyDebugPanel = lazy(() =>
  import('./debug_panel').then((module) => ({ default: module.DebugPanel })),
);

function getSpeakerName(element: Paragraph, speaker_names: Record<string, string>): string {
  if (element.speaker === null) {
    return `Unknown`;
  } else if (element.speaker in speaker_names) {
    return speaker_names[element.speaker];
  } else {
    return `Unnamed Speaker (${element.speaker})`;
  }
}

function renderElement(
  { element, children, attributes }: RenderElementProps,
  doc: Automerge.Doc<Document>,
): JSX.Element {
  if (element.type === 'paragraph') {
    const para_start = element.children[0].start;
    const para_end = element.children[element.children.length - 1].end;
    return (
      <div className="mb-6 flex">
        <div contentEditable={false} className="w-48 mr-8">
          {getSpeakerName(element, doc.speaker_names)}
          <div className="text-slate-500 dark:text-neutral-400">
            {'['}
            {para_start?.toFixed(2)}
            {'→'}
            {para_end?.toFixed(2)}
            {'] '}
            {element.lang}
          </div>
        </div>
        <div {...attributes} className="grow-1 basis-full" lang={element.lang}>
          {children}
        </div>
      </div>
    );
  }

  throw Error('Unknown element type');
}

function renderLeaf({ leaf, children, attributes }: RenderLeafProps): JSX.Element {
  const classes = ['word'];
  if (leaf.conf != undefined && leaf.conf < 0.7) {
    classes.push('text-red-600 dark:text-red-500');
  }
  if (leaf.start !== undefined) {
    classes.push(startTimeToClassName(leaf.start));
  }

  return (
    <span
      {...attributes}
      className={classes.join(' ')}
      onClick={() => {
        // this event is handeled in player.tsx to set the time when someone clicks a word
        window.dispatchEvent(new TextClickEvent(leaf));
      }}
    >
      {children}
    </span>
  );
}

export function TranscriptionEditor({ documentId }: { documentId: string }) {
  const debugMode = useDebugMode();
  const [value, setValue] = useState<Descendant[]>([]);
  const [syncComplete, setSyncComplete] = useState<boolean>(false);

  const editor = useMemo(() => {
    const baseEditor = createEditor();
    const editorWithReact = withReact(baseEditor);
    return withAutomergeDoc(editorWithReact, Automerge.init());
  }, [documentId]);

  const url = new URL(`ws://localhost:8000/api/v1/documents/sync/${documentId}/`);
  const authToken = localStorage.getItem('auth');
  url.searchParams.append('authorization', `Token ${authToken}`);

  const [_location, navigate] = useLocation();

  useEffect(() => {
    const provider = new AutomergeWebsocketProvider(url.href);

    provider.on('initalSyncComplete', () => {
      setSyncComplete(true);
      if (editor.doc.version !== 1) {
        alert('The document is in an unsupported version.');
        navigate('/');
      }
    });

    provider.on('update', ({ change, remote }: { change: Uint8Array; remote: boolean }) => {
      if (!remote) return;

      // skip own changes
      // TODO: filter own changes in backend?
      if (Automerge.decodeChange(change).actor == Automerge.getActorId(editor.doc)) return;

      const [newDoc] = Automerge.applyChanges(editor.doc, [change]);
      editor.setDoc(newDoc);
    });

    provider.on('fullDoc', (fullDoc: Uint8Array) => editor.setDoc(Automerge.load(fullDoc)));

    editor.onDocChange = (newDoc) => {
      const lastChange = Automerge.getLastLocalChange(newDoc);
      if (lastChange) {
        provider.emit('update', [{ change: lastChange, remote: false }]);
      }
    };
  }, [editor]);

  useEffect(() => {
    const preventCtrlS = (e: KeyboardEvent) => {
      const ctrlOrCmd = window.navigator.platform.match('Mac') ? e.metaKey : e.ctrlKey;
      if (ctrlOrCmd && e.key === 's') {
        e.preventDefault();
        console.log('CommandOrControl + S prevented – we automatically save the document anyways');
      }
    };
    document.addEventListener('keydown', preventCtrlS);
    return () => document.removeEventListener('keydown', preventCtrlS);
  }, []);

  return (
    <>
      <div className="flex justify-end w-full">
        <SecondaryButton
          className="my-4"
          onClick={() => {
            const vtt = generateWebVtt(Automerge.toJS(editor.doc));
            downloadTextAsFile('document.vtt', 'text/vtt', vtt.toString());
          }}
        >
          Export as WebVTT
        </SecondaryButton>
      </div>
      <div className={syncComplete ? '' : 'blur'}>
        <Slate editor={editor} value={value} onChange={setValue}>
          <Editable
            renderElement={(props) => renderElement(props, editor.doc)}
            renderLeaf={renderLeaf}
            onClick={() => {
              const selection = document.getSelection();
              if (
                selection?.isCollapsed &&
                selection.anchorNode?.parentElement?.parentElement?.classList.contains('word')
              ) {
                selection.anchorNode.parentElement.click();
              }
            }}
          />
        </Slate>
      </div>

      <Suspense>{debugMode && <LazyDebugPanel editor={editor} value={value} />}</Suspense>
      <PlayerBar documentId={documentId} documentContent={value} />
    </>
  );
}
