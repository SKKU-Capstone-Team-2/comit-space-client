'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Clock } from 'lucide-react'
import Image from 'next/image'
import { redirect, useRouter } from 'next/navigation'
import { SetStateAction, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { MdHelpOutline } from 'react-icons/md'
import { z } from 'zod'

import ScrollToTopButton from '@/components/common/ScrollToTopButton'
import SectionBanner from '@/components/common/SectionBanner'
import StudyCard from '@/components/common/StudyCard'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { formatDateToTime } from '@/components/ui/time-picker-utils'
import { TimePicker } from '@/components/ui/timepicker'
import { useToast } from '@/components/ui/use-toast'
import { API_ENDPOINTS, ApiEndpoint } from '@/constants/apiEndpoint'
import { ROUTES } from '@/constants/routes'
import { useSession } from '@/lib/auth/SessionProvider'
import { fetchData } from '@/lib/fetch'
import { useSupabaseFile } from '@/lib/supabase/hooks'
import { Campus, Day, Level, Study } from '@/types'

// TODO: constants로 추출
const schema = z.object({
  imageSrc: z.string({
    required_error: '이미지를 업로드해주세요'
  }),
  title: z.string().min(1, { message: '스터디 제목을 입력해주세요' }),
  day: z.enum(['월', '화', '수', '목', '금', '토', '일'], {
    required_error: '요일을 선택해주세요'
  }),
  startTime: z.string({
    required_error: '스터디 시간을 입력해주세요'
  }),
  endTime: z.string({
    required_error: '스터디 시간을 입력해주세요'
  }),
  campus: z.enum(['율전', '명륜', '온라인'], {
    required_error: '캠퍼스를 선택해주세요'
  }),
  level: z.enum(['초급', '중급', '고급'], {
    required_error: '난이도를 선택해주세요'
  }),
  tags: z.array(z.string()).min(1, { message: '스택을 입력해주세요' }),
  description: z
    .string()
    .min(1, { message: '설명을 입력해주세요' })
    .max(800, { message: '설명은 800자 이내로 입력해주세요' })
})

// Iterators
type StudyForm = Omit<Study, 'id' | 'mentor' | 'isRecruiting'>
const dayOptions: Day[] = ['월', '화', '수', '목', '금', '토', '일']
const campusOptions: Campus[] = ['율전', '명륜', '온라인']
const levelOptions: Level[] = ['초급', '중급', '고급']

export default function OpenStudy() {
  const session = useSession()
  const router = useRouter()
  const { toast } = useToast()
  const fileHandler = useSupabaseFile({ pathPrefix: 'image/study' })
  const fileRef = useRef<HTMLInputElement>(null)

  const {
    handleSubmit,
    trigger,
    register,
    setValue,
    getValues,
    watch,
    control,
    setError,
    clearErrors,
    formState: { errors, isValid, isSubmitting }
  } = useForm<StudyForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      tags: []
    }
  })

  // State management
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [image, setImage] = useState<string>('')
  const [stackError, setTagError] = useState<string>('')
  const [currentTag, setCurrentTag] = useState<string>('')
  const [startTime, setStartTime] = useState<TimeInput>(undefined)
  const [endTime, setEndTime] = useState<TimeInput>(undefined)

  // Authentication check
  if (session === null) {
    return null // Wait for session to load
  }

  if (session.error) {
    redirect(ROUTES.LOGIN.url)
  }

  // Check if user can open study
  const canOpenStudy = session.data.role ? ['ROLE_VERIFIED', 'ROLE_ADMIN'].includes(session.data.role) : false

  if (!canOpenStudy) {
    redirect(ROUTES.STUDY.index.url)
  }

  const onSubmit = async (data: StudyForm) => {
    document.getElementById('closeDialog')?.click()

    if (!imageFile) return
    const file = await fileHandler.upload(imageFile)
    const fileUrl = file.supabaseFileData.url
    const res = await fetchData(API_ENDPOINTS.CLIENT.STUDY.CREATE as ApiEndpoint, {
      body: JSON.stringify({
        ...data,
        imageSrc: fileUrl,
        isRecruiting: true,
        semester: 'Spring',
        year: 2025
      }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.data.accessToken}`
      },
      credentials: 'include'
    })
    if (!res.ok) {
      await file.delete()
      return
    }
    file.commit()
    toast({
      title: '스터디 생성 완료',
      description: '스터디가 성공적으로 생성되었습니다.'
    })
    router.push(ROUTES.STUDY.index.url)
  }
  const handleFileChange = (e: React.ChangeEvent) => {
    const targetFiles = (e.target as HTMLInputElement).files as FileList
    // 예외 Case: 파일 입력 후 다시 닫을때
    if (targetFiles.length) {
      const selectedFile = URL.createObjectURL(targetFiles[0])
      setImage(selectedFile)
      setValue('imageSrc', selectedFile)
      setImageFile(targetFiles[0])
    }
  }

  // Tag
  const watchedTags: string[] = watch('tags')

  const handleTagChange = (e: { target: { value: SetStateAction<string> } }) => {
    setCurrentTag(e.target.value)
  }
  const handleTagAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const newTag = e.currentTarget.value.trim()

    if (watchedTags.length === 4) {
      newTag !== '' ? setTagError('스택은 최대 4개까지만 입력 가능합니다') : setTagError('')
    }

    if (e.key === 'Enter' && newTag !== '') {
      watchedTags.length !== 4 ? handleDuplicateTag() : setCurrentTag('')
    }
  }
  const handleDuplicateTag = () => {
    const newTag = getValues('tags').concat(currentTag)

    if (new Set(newTag).size === getValues('tags').length) {
      setError('tags', {
        type: 'Duplicate',
        message: '중복 스택이 존재합니다'
      })
    } else {
      clearErrors('tags')
      setValue('tags', getValues('tags') ? newTag : [currentTag])
    }
    setCurrentTag('')
  }

  // Time
  type TimeInput = Date | undefined

  const onChangeStartTime = (date: TimeInput) => {
    if (typeof date !== 'undefined') {
      setValue('startTime', formatDateToTime(date))
      setStartTime(date)
    }
  }

  const onChangeEndTime = (date: TimeInput) => {
    if (typeof date !== 'undefined') {
      setValue('endTime', formatDateToTime(date))
      setEndTime(date)
    }
  }

  return (
    <div className="flex flex-col items-center">
      <SectionBanner title="Open Study" description="새로운 스터디 분반을 개설합니다!" />
      <form className="flex flex-col gap-4 max-sm:px-3" onSubmit={handleSubmit(onSubmit)}>
        <div className="flex gap-8 max-md:flex-col max-md:gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xl font-semibold">이미지</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                fileRef?.current?.click()
              }}
              className="flex h-52 w-52 items-center justify-center overflow-hidden rounded-lg border border-slate-300"
            >
              {!image ? (
                <p className="text-5xl font-light text-slate-300">+</p>
              ) : (
                <Image src={image} width={208} height={208} alt={image} className="h-full w-full object-cover" />
              )}
            </Button>
            <Input className="hidden" accept="image/*" type="file" ref={fileRef} onChange={handleFileChange} />
            {errors.imageSrc && <p className="text-sm text-red-500">{errors.imageSrc.message}</p>}
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-xl font-semibold">스터디 제목</p>
              <Input placeholder="스터디 제목을 입력해주세요" id="title" {...register('title')} className="w-full" />
              {errors.title && <p className="text-sm text-red-500">{errors.title.message}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <p className="flex items-center text-xl font-semibold">
                시간
                <Clock className="ml-2 h-4 w-4" />
              </p>

              <div className="flex items-center justify-start gap-2 max-md:gap-4">
                <div className="flex flex-col gap-1">
                  <TimePicker date={startTime} setDate={onChangeStartTime} />
                </div>
                ~
                <div className="flex flex-col gap-1">
                  <TimePicker date={endTime} setDate={onChangeEndTime} />
                </div>
              </div>
              {(errors.startTime || errors.endTime) && (
                <p className="text-sm text-red-500">{errors.startTime?.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-xl font-semibold">요일</p>
              <Controller
                control={control}
                name="day"
                render={({ field: { onChange, value } }) => (
                  <Tabs value={value} onValueChange={onChange}>
                    <TabsList>
                      {dayOptions.map((level) => (
                        <TabsTrigger key={level} value={level}>
                          {level}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                )}
              />
              {errors.day && <p className="text-sm text-red-500">{errors.day.message}</p>}
            </div>
          </div>
        </div>

        <div className="flex justify-between max-md:flex-col max-md:gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xl font-semibold">캠퍼스</p>
            <Controller
              control={control}
              name="campus"
              render={({ field: { onChange, value } }) => (
                <Tabs value={value} onValueChange={onChange}>
                  <TabsList>
                    {campusOptions.map((campus) => (
                      <TabsTrigger key={campus} value={campus}>
                        {campus}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}
            />
            {errors.campus && <p className="text-sm text-red-500">{errors.campus.message}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-xl font-semibold">난이도</p>
            <Controller
              control={control}
              name="level"
              render={({ field: { onChange, value } }) => (
                <Tabs value={value} onValueChange={onChange}>
                  <TabsList>
                    {levelOptions.map((level) => (
                      <TabsTrigger key={level} value={level}>
                        {level}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}
            />
            {errors.level && <p className="text-sm text-red-500">{errors.level.message}</p>}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="text-xl font-semibold">주제 / 기술 스택</p>
            <Popover>
              <PopoverTrigger asChild>
                <button>
                  <MdHelpOutline className="hover:text-gray-600" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="mb-2 flex w-64 justify-center text-sm" side="top">
                <ul>
                  <li>최대 4개까지 입력 가능하며</li>
                  <li>첫번째 스택만 미리보기에 표시됩니다.</li>
                </ul>
              </PopoverContent>
            </Popover>
          </div>
          {stackError && <p className="text-sm text-red-500">{stackError}</p>}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Input
                  placeholder="주제를 입력해주세요"
                  id="tags"
                  value={currentTag}
                  onChange={handleTagChange}
                  onKeyUp={handleTagAdd}
                  className="w-60"
                />
                <Button
                  type="button"
                  className="absolute right-2 top-1/2 z-10 h-4 w-4 -translate-y-1/2 p-3 text-xl"
                  disabled={currentTag.trim() === '' || (watchedTags && watchedTags.length >= 4)}
                  onClick={handleDuplicateTag}
                >
                  +
                </Button>
              </div>
              <Button
                variant={'secondary'}
                className="p-3"
                type="button"
                onClick={() => {
                  setTagError('')
                  clearErrors('tags')
                  setValue('tags', [])
                }}
              >
                Reset
              </Button>
            </div>
            {errors.tags && <p className="-mt-2 text-sm text-red-500">{errors.tags.message}</p>}
            <div className="flex gap-4">
              {watchedTags &&
                watchedTags.map((tags, index) => (
                  <Badge variant="secondary" key={index}>
                    {tags}
                  </Badge>
                ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-xl font-semibold">설명</p>
          <Textarea
            placeholder="스터디 목표, 배우는 내용, 선행돼야 하는 지식 등을 구체적으로 작성해주세요"
            id="description"
            {...register('description')}
            className="h-48 w-full"
            onInput={() => {
              trigger('description')
            }}
          />
          {errors.description && <p className="text-sm text-red-500">{errors.description.message}</p>}
        </div>
        <div className="my-8 flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                className="px-8 font-extrabold"
                onClick={() => {
                  trigger()
                  isValid && setTagError('')
                }}
              >
                제출하기
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="flex flex-col p-3 sm:max-w-[425px] lg:p-8">
              <AlertDialogHeader>
                <AlertDialogTitle>제출하시겠습니까?</AlertDialogTitle>
                <AlertDialogDescription>
                  스터디 개설이 되는 즉시 스터디가 모집 중으로 변경됩니다. 한 번 개설된 스터디는 삭제할 수 없습니다.
                </AlertDialogDescription>
              </AlertDialogHeader>

              {/* 미리보기 카드 */}
              <div className="flex justify-center">
                <StudyCard
                  study={{
                    id: 0,
                    campus: getValues('campus') || '공통',
                    day: getValues('day') || '월',
                    description: getValues('description') || '',
                    endTime: getValues('endTime') || '00:00',
                    imageSrc: getValues('imageSrc') || '',
                    isRecruiting: true,
                    level: getValues('level') || '초급',
                    mentor: {
                      bio: '',
                      email: '',
                      github: '',
                      id: 0,
                      phoneNumber: '',
                      position: '',
                      profileImage: '',
                      role: 'ROLE_MEMBER',
                      studentId: '',
                      isStaff: false,
                      username: ''
                    },
                    semester: '1',
                    tags: getValues('tags') || [],
                    startTime: getValues('startTime') || '00:00',
                    title: getValues('title') || ''
                  }}
                />
              </div>
              {!isValid && <p className="text-sm text-destructive">모든 항목이 제대로 입력되었는지 확인해주세요!</p>}
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction type="submit" onClick={handleSubmit(onSubmit)} disabled={!isValid || isSubmitting}>
                  확인
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </form>
      <ScrollToTopButton />
    </div>
  )
}
