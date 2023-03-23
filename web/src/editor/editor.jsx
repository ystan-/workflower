import { atoms } from '../core/atoms';
import { setDiagnosticsOptions } from 'monaco-yaml';
import { editor, Uri, KeyCode, KeyMod } from 'monaco-editor';
import { useRecoilState } from 'recoil';
import React, { lazy, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import YamlWorker from './yaml-worker?worker';
import api from '../core/api';

const CreateWorkflowButton = lazy(() => import('../create-workflow/create-workflow-button'));

window.MonacoEnvironment = {
    getWorker: (moduleId, label) => new YamlWorker(),
};
const uri = 'https://raw.githubusercontent.com/finos/symphony-wdk/master/workflow-language/src/main/resources/swadl-schema-1.0.json';
const modelUri = Uri.parse(uri);
setDiagnosticsOptions({
    validate: true,
    enableSchemaRequest: true,
    format: true,
    hover: true,
    completion: true,
    schemas: [{ uri: uri, fileMatch: [String(modelUri)] }],
});

const Root = styled.div`
    border: #8f959e 1px solid;
    flex: 1 1 1px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    max-height: calc(100vh - 7rem);
`;

const EditorRoot = styled.div`
    height: ${props => (props.large ? '100%' : '80%')};
`;

const ProblemsRoot = styled.div`
    background-color: var(--tk-color-red-${props => props.theme === 'light' ? 20 : 60});
    border-top: 1px #8f959e solid;
    overflow-x: auto;
    height: 100px;
    justify-self: flex-end;
`;

const ProblemEntry = styled.div`
    font-size: .9rem;
    padding: .2rem;
    :hover {
        background-color: var(--tk-color-red-${props => props.theme === 'light' ? 30 : 40});
        cursor: pointer;
    }
`;

const EmptyRoot = styled.div`
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
`;

const Editor = () => {
    const ref = useRef(null);
    const { readWorkflow, addWorkflow, showStatus } = api();
    const [ thisEditor, setThisEditor ] = useState();
    const theme = useRecoilState(atoms.theme)[0];
    const currentWorkflow = useRecoilState(atoms.currentWorkflow)[0];
    const [ init, setInit ] = useState(false);
    const [ model, setModel ] = useState();
    const [ markers, setMarkers ] = useRecoilState(atoms.markers);
    const [ isContentChanged, setIsContentChanged ] = useRecoilState(atoms.isContentChanged);
    const [ loading, setLoading ] = useRecoilState(atoms.loading);
    const snippet = useRecoilState(atoms.snippet)[0];
    const [ contents, setContents ] = useRecoilState(atoms.contents);
    const [ author, setAuthor ] = useRecoilState(atoms.author);
    const activeVersion = useRecoilState(atoms.activeVersion)[0];
    const session = useRecoilState(atoms.session)[0];
    const setWorkflows = useRecoilState(atoms.workflows)[1];

    useEffect(() => {
        if (!currentWorkflow) {
            setContents(undefined);
            setAuthor(undefined);
            return;
        }
        readWorkflow(currentWorkflow?.value, (response) => {
            const current = response[0];
            setContents(current.swadl);
            setAuthor(current.createdBy);
        });
    }, [ currentWorkflow, activeVersion ]);

    useEffect(() => {
        if (!snippet.content) {
            return;
        }
        if (thisEditor) {
            let id = { major: 1, minor: 1 };
            let range = thisEditor.getSelection();
            let op = { identifier: id, range: range, text: snippet.content, forceMoveMarkers: true };
            thisEditor.executeEdits("wizard", [op]);
            thisEditor.focus();
        }
    }, [ snippet ]);

    useEffect(() => {
        if (!contents) {
            return;
        }
        if (thisEditor) {
            thisEditor.setValue(contents);
            thisEditor.updateOptions({ readOnly: author !== session.id });
        } else {
            let yamlModel;
            if (!model) {
                yamlModel = editor.createModel(contents, 'yaml', modelUri);
                setModel(yamlModel);
            } else {
                yamlModel = model;
            }
            const newEditor = editor.create(ref.current, {
                language: 'yaml',
                automaticLayout: true,
                model: yamlModel,
                theme: 'vs-' + theme,
                scrollbar: { vertical: 'hidden' },
                readOnly: author !== session.id,
            });

            newEditor.onDidChangeModelContent((e) => {
                const modifiedContents = yamlModel.getValue();
                if (modifiedContents !== contents && !e.isFlush) {
                    setIsContentChanged('modified');
                } else {
                    setIsContentChanged('original');
                }
            });
            editor.onDidChangeMarkers(({ resource }) => setMarkers(editor.getModelMarkers({ resource })));
            setThisEditor(newEditor);
        }
    }, [ contents, author ]);

    useEffect(() => {
        if (thisEditor && !init) {
            thisEditor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => saveWorkflow());
            setInit(true);
        }
    }, [ thisEditor, loading, isContentChanged ]);

    const saveWorkflow = () => {
        if (loading || isContentChanged === 'original' || author !== session.id) {
            return;
        }
        const swadl = editor.getModels()[0].getValue();
        setLoading(true);
        addWorkflow({ swadl, createdBy: session.id, description: 'Quick Save' }).then(() => {
            setLoading(false);
            setWorkflows(undefined);
            showStatus(false, 'Workflow saved');
        }, ({ message }) => showStatus(true, message));
    };

    const goto = (lineNumber, column) => {
        thisEditor.revealLineInCenter(lineNumber);
        thisEditor.setPosition({ lineNumber, column });
        thisEditor.focus();
    }

    const Problems = ({ theme, markers }) => markers.map((
        { startLineNumber, startColumn, message }, index
    ) => (
        <ProblemEntry key={index} theme={theme} onClick={() => goto(startLineNumber, startColumn)}>
            {startLineNumber}: {message}
        </ProblemEntry>
    ));

    const Empty = () => (
        <EmptyRoot>
            <CreateWorkflowButton />
        </EmptyRoot>
    );

    return (
        <Root>
            { !contents ? <Empty /> : <EditorRoot ref={ref} large={markers.length === 0} /> }
            { markers.length > 0 && (
                <ProblemsRoot {...{ theme }}>
                    <Problems {...{ theme, markers }} />
                </ProblemsRoot>
            )}
        </Root>
    );
};

export default Editor;
