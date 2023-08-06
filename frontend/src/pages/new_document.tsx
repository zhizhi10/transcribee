import { useEffect, useRef, useState } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import clsx from 'clsx';
import { useLocation } from 'wouter';

import { createDocument } from '../api/document';
import { Dialog, DialogTitle } from '../components/dialog';
import { FormControl, Input, Select } from '../components/form';
import { LoadingSpinnerButton, SecondaryButton } from '../components/button';
import { AppCenter } from '../components/app';
import { useGetConfig } from '../api/config';

type FieldValues = {
  name: string;
  audioFile: FileList | undefined;
  model: string;
  language: string;
  speakerDetection: 'off' | 'on' | 'advanced';
  numberOfSpeakers: number;
};

type ModelConfig = ReturnType<typeof useGetConfig>['data']['models'];

export function getLanguages(models: ModelConfig, model: string | undefined): string[] | null {
  if (model === undefined) {
    return null;
  }
  return models[model]?.languages || [];
}

export function NewDocumentPage() {
  const [_, navigate] = useLocation();
  const [dropIndicator, setDropIndicator] = useState(false);
  const audioFileRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const { data: config, isLoading } = useGetConfig({});
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<FieldValues>({
    values: {
      model: 'base',
      language: '',
      audioFile: undefined,
      name: '',
      speakerDetection: 'on',
      numberOfSpeakers: 2,
    },
  });

  const { ref: audioFileRegisterRef, ...audioFileRegister } = register('audioFile', {
    required: true,
  });

  const audioFile = watch('audioFile');
  const model = watch('model');
  const speakerDetection = watch('speakerDetection');

  // set initial language based on selected model
  useEffect(() => {
    if (!config) return;
    setValue('language', getLanguages(config.models, model)?.[0] || 'auto');
  }, [config, model]);

  const submitHandler: SubmitHandler<FieldValues> = async (data) => {
    if (!data.audioFile) {
      console.error('[NewDocumentPage] Illegal state: audioFile is undefined.');
      return;
    }

    try {
      setLoading(true);

      type DocumentCreateParameters = Parameters<typeof createDocument>[0];
      const documentParameters: DocumentCreateParameters = {
        name: data.name,
        file: data.audioFile[0],
        model: data.model,
        language: data.language,
      };
      if (data.speakerDetection == 'off') {
        documentParameters.number_of_speakers = 0;
      } else if (data.speakerDetection == 'advanced') {
        documentParameters.number_of_speakers = data.numberOfSpeakers;
      }

      const response = await createDocument(documentParameters);

      if (response.ok) {
        navigate('/');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppCenter onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}>
      <Dialog className={'w-96'}>
        <DialogTitle>New Document</DialogTitle>
        <form onSubmit={handleSubmit(submitHandler)}>
          <div className="flex flex-col gap-6">
            <FormControl label="Name" error={errors.name && 'This field is required.'}>
              <Input autoFocus {...register('name', { required: true })} />
            </FormControl>

            <div>
              <div
                className={clsx(
                  'border-2',
                  'border-b-0',
                  'border-black dark:border-neutral-200',
                  'rounded-t',
                  'h-32',
                  'flex',
                  'items-center',
                  'justify-center',
                  'relative',
                )}
                onDragEnter={() => setDropIndicator(true)}
                onDragExit={() => setDropIndicator(false)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropIndicator(false);

                  const fileType = e.dataTransfer.files[0].type;

                  if (!fileType.startsWith('audio/') && !fileType.startsWith('video/')) {
                    return;
                  }

                  setValue('audioFile', e.dataTransfer.files, {
                    shouldTouch: true,
                    shouldDirty: true,
                  });

                  if (audioFileRef.current) {
                    // also set files via ref since react-hook-form's setValue does not set the value properly
                    audioFileRef.current.files = e.dataTransfer.files;
                  }
                }}
              >
                <div
                  className={clsx(
                    'absolute',
                    'top-2 text-center',
                    'bottom-1',
                    'right-1',
                    'left-1',
                    'border-2',
                    'rounded',
                    'border-black dark:border-neutral-200',
                    'border-dashed',
                    'flex',
                    'items-center',
                    'justify-center',
                    dropIndicator || 'hidden',
                  )}
                >
                  <div className="text-center">
                    <p className="font-medium">Drop audio file…</p>
                  </div>
                </div>
                <div className={clsx('text-center', dropIndicator && 'hidden')}>
                  <p className="font-medium">Drag audio file here</p>
                  <p className="relative">
                    or{' '}
                    <input
                      {...audioFileRegister}
                      ref={(ref) => {
                        audioFileRegisterRef(ref);
                        audioFileRef.current = ref;
                      }}
                      type="file"
                      className="opacity-0 absolute peer w-full"
                      accept="audio/*,video/*"
                    />
                    <a
                      href="#"
                      className={clsx(
                        'inline-block',
                        'relative',
                        'link',
                        'underline',
                        'rounded-sm',
                        'pointer-events-none',
                        'hover:opacity-60',
                        'peer-hover:opacity-60',
                        'peer-focus-visible:outline',
                        'peer-focus-visible:outline-3',
                        'peer-focus-visible:outline-blue-600',
                      )}
                    >
                      choose file
                    </a>
                  </p>
                </div>
              </div>
              <div
                className={clsx(
                  'bg-black dark:bg-neutral-200',
                  'text-white dark:text-black',
                  'text-sm',
                  'text-center',
                  'p-2',
                  'whitespace-nowrap',
                  'overflow-hidden',
                  'text-ellipsis',
                  'rounded-b',
                )}
              >
                {audioFile?.[0]?.name || 'No file selected.'}
              </div>
              {errors.audioFile && (
                <p className="text-red-600 text-sm mt-0.5">Audio file is required.</p>
              )}
            </div>
            {!isLoading ? (
              <div className="flex row">
                <FormControl label="Model" error={errors.model?.message} className="flex-grow mr-2">
                  <Select {...register('model')}>
                    {Object.values(config.models).map((cur_model) =>
                      cur_model !== undefined ? (
                        <option value={cur_model.id} key={cur_model.id}>
                          {cur_model.name}
                        </option>
                      ) : (
                        <></>
                      ),
                    )}
                  </Select>
                </FormControl>
                <FormControl
                  label="Language"
                  error={errors.language?.message}
                  className="flex-grow"
                >
                  <Select {...register('language')}>
                    {getLanguages(config.models, model)?.map((lang) => (
                      <option value={lang} key={lang}>
                        {lang}
                      </option>
                    ))}
                  </Select>
                </FormControl>
              </div>
            ) : (
              <></>
            )}

            <FormControl label={'Speaker Detection'}>
              <div className="flex">
                <input
                  type="radio"
                  id="off"
                  value={'off'}
                  className="hidden peer/off"
                  {...register('speakerDetection')}
                />
                <label
                  htmlFor="off"
                  className={clsx(
                    'block bg-transparent py-2 text-center flex-grow basis-1',
                    'peer-checked/off:bg-gray-300 dark:peer-checked/off:bg-gray-700',
                    'border-black dark:border-white border-2 rounded-l',
                  )}
                >
                  Off
                </label>

                <input
                  type="radio"
                  id="on"
                  value={'on'}
                  className="hidden peer/on"
                  {...register('speakerDetection')}
                />
                <label
                  htmlFor="on"
                  className={clsx(
                    'block bg-transparent  py-2 text-center flex-grow basis-1',
                    'peer-checked/on:bg-gray-300 dark:peer-checked/on:bg-gray-700',
                    'border-black dark:border-white border-y-2',
                  )}
                >
                  On
                </label>

                <input
                  type="radio"
                  id="advanced"
                  value={'advanced'}
                  className="hidden peer/advanced"
                  {...register('speakerDetection')}
                />
                <label
                  htmlFor="advanced"
                  className={clsx(
                    'block bg-transparent py-2 text-center flex-grow basis-1',
                    'peer-checked/advanced:bg-gray-300 dark:peer-checked/advanced:bg-gray-700',
                    'border-black dark:border-white border-2 rounded-r',
                  )}
                >
                  Advanced
                </label>
              </div>
            </FormControl>
            {speakerDetection == 'advanced' && (
              <FormControl label="Number of Speakers" className="-mt-4">
                <Input type="number" min={2} {...register('numberOfSpeakers')} />
              </FormControl>
            )}

            <div className="flex justify-between">
              <SecondaryButton type="button" onClick={() => navigate(`/`)}>
                Cancel
              </SecondaryButton>
              <LoadingSpinnerButton loading={loading} variant="primary" type="submit">
                Create
              </LoadingSpinnerButton>
            </div>
          </div>
        </form>
      </Dialog>
    </AppCenter>
  );
}
