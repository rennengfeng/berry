/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getUserModels, getUserGroups, sendImageGeneration } from './api'
import { PlaygroundChat } from './components/playground-chat'
import { PlaygroundInput } from './components/playground-input'
import { ERROR_MESSAGES, MESSAGE_STATUS } from './constants'
import { usePlaygroundState, useChatHandler } from './hooks'
import {
  createUserMessage,
  createLoadingAssistantMessage,
  updateAssistantMessageWithError,
  updateCurrentVersionContent,
  updateLastAssistantMessage,
} from './lib'
import type { ImageGenerationData, Message as MessageType } from './types'

const toImageUrl = (image: ImageGenerationData) => {
  if (image.url) return image.url
  if (!image.b64_json) return ''
  if (image.b64_json.startsWith('data:')) return image.b64_json
  return `data:image/png;base64,${image.b64_json}`
}

const escapeImageAlt = (value: string) =>
  value.replace(/[\[\]\r\n]/g, ' ').trim()

const formatGeneratedImages = (images?: ImageGenerationData[]) => {
  if (!images?.length) return ''

  return images
    .map((image, index) => {
      const imageUrl = toImageUrl(image)
      if (!imageUrl) return ''

      const altText = escapeImageAlt(
        image.revised_prompt || `Generated image ${index + 1}`
      )
      const markdown = [`![${altText}](${imageUrl})`]

      if (image.revised_prompt) {
        markdown.push(`> ${image.revised_prompt}`)
      }

      return markdown.join('\n\n')
    })
    .filter(Boolean)
    .join('\n\n')
}

const getRequestErrorMessage = (error: unknown) => {
  const err = error as {
    response?: { data?: { message?: string; error?: { message?: string } } }
    message?: string
  }

  return (
    err?.response?.data?.message ||
    err?.response?.data?.error?.message ||
    err?.message ||
    ERROR_MESSAGES.API_REQUEST_ERROR
  )
}

export function Playground() {
  const {
    config,
    parameterEnabled,
    messages,
    models,
    groups,
    updateMessages,
    setModels,
    setGroups,
    updateConfig,
  } = usePlaygroundState()

  const { sendChat, stopGeneration, isGenerating } = useChatHandler({
    config,
    parameterEnabled,
    onMessageUpdate: updateMessages,
  })
  const [isImageGenerating, setIsImageGenerating] = useState(false)
  const isBusy = isGenerating || isImageGenerating

  // Edit dialog state
  const [editingMessageKey, setEditingMessageKey] = useState<string | null>(
    null
  )

  // Load models
  const { data: modelsData, isLoading: isLoadingModels } = useQuery({
    queryKey: ['playground-models'],
    queryFn: getUserModels,
  })

  // Load groups
  const { data: groupsData } = useQuery({
    queryKey: ['playground-groups'],
    queryFn: getUserGroups,
  })

  // Update models when data changes
  useEffect(() => {
    if (!modelsData) return

    setModels(modelsData)

    // Set default model if current model is not available
    const isCurrentModelValid = modelsData.some((m) => m.value === config.model)
    if (modelsData.length > 0 && !isCurrentModelValid) {
      updateConfig('model', modelsData[0].value)
    }
  }, [modelsData, config.model, setModels, updateConfig])

  // Update groups when data changes
  useEffect(() => {
    if (!groupsData) return

    setGroups(groupsData)

    const hasCurrentGroup = groupsData.some((g) => g.value === config.group)
    if (!hasCurrentGroup && groupsData.length > 0) {
      const fallback =
        groupsData.find((g) => g.value === 'default')?.value ??
        groupsData[0].value
      updateConfig('group', fallback)
    }
  }, [groupsData, setGroups, config.group, updateConfig])

  const handleSendMessage = (text: string) => {
    const userMessage = createUserMessage(text)
    const assistantMessage = createLoadingAssistantMessage()

    const newMessages = [...messages, userMessage, assistantMessage]
    updateMessages(newMessages)

    // Send chat request
    sendChat(newMessages)
  }

  const handleGenerateImage = async (text: string) => {
    const prompt = text.trim()
    if (!prompt || isBusy) return

    const userMessage = createUserMessage(prompt)
    const assistantMessage = createLoadingAssistantMessage()
    const newMessages = [...messages, userMessage, assistantMessage]

    updateMessages(newMessages)
    setIsImageGenerating(true)

    try {
      const response = await sendImageGeneration({
        model: config.model,
        group: config.group,
        prompt,
        n: 1,
        size: '1024x1024',
        response_format: 'url',
      })
      const content = formatGeneratedImages(response.data)

      if (!content) {
        throw new Error('Image generation returned no image data')
      }

      updateMessages((prev) =>
        updateLastAssistantMessage(prev, (message) => ({
          ...updateCurrentVersionContent(message, content),
          reasoning: undefined,
          isReasoningStreaming: false,
          isReasoningComplete: true,
          isContentComplete: true,
          status: MESSAGE_STATUS.COMPLETE,
        }))
      )
    } catch (error: unknown) {
      updateMessages((prev) =>
        updateAssistantMessageWithError(prev, getRequestErrorMessage(error))
      )
    } finally {
      setIsImageGenerating(false)
    }
  }

  const handleCopyMessage = (message: MessageType) => {
    // Copy is handled in MessageActions component
    // eslint-disable-next-line no-console
    console.log('Message copied:', message.key)
  }

  const handleRegenerateMessage = (message: MessageType) => {
    // Find the message index and regenerate from there
    const messageIndex = messages.findIndex((m) => m.key === message.key)
    if (messageIndex === -1) return

    // Remove messages after this one and regenerate
    const messagesUpToHere = messages.slice(0, messageIndex)
    const loadingMessage = createLoadingAssistantMessage()
    const newMessages = [...messagesUpToHere, loadingMessage]

    updateMessages(newMessages)
    sendChat(newMessages)
  }

  const handleEditMessage = useCallback((message: MessageType) => {
    setEditingMessageKey(message.key)
  }, [])

  const handleEditOpenChange = useCallback((open: boolean) => {
    if (!open) setEditingMessageKey(null)
  }, [])

  // Apply edit and optionally re-submit from the edited user message
  const applyEdit = useCallback(
    (newContent: string, submit: boolean) => {
      if (!editingMessageKey) return
      const index = messages.findIndex((m) => m.key === editingMessageKey)
      if (index === -1) return

      const updated = messages.map((m) =>
        m.key === editingMessageKey
          ? { ...m, versions: [{ ...m.versions[0], content: newContent }] }
          : m
      )

      setEditingMessageKey(null)

      if (!submit || updated[index].from !== 'user') {
        updateMessages(updated)
        return
      }

      const toSubmit = [
        ...updated.slice(0, index + 1),
        createLoadingAssistantMessage(),
      ]
      updateMessages(toSubmit)
      sendChat(toSubmit)
    },
    [editingMessageKey, messages, updateMessages, sendChat]
  )

  const handleDeleteMessage = (message: MessageType) => {
    const newMessages = messages.filter((m) => m.key !== message.key)
    updateMessages(newMessages)
  }

  return (
    <div className='relative flex size-full flex-col overflow-hidden'>
      {/* Full-width scroll container: scrolling works even over side whitespace */}
      <div className='flex flex-1 flex-col overflow-hidden'>
        <PlaygroundChat
          messages={messages}
          onCopyMessage={handleCopyMessage}
          onRegenerateMessage={handleRegenerateMessage}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          isGenerating={isBusy}
          editingKey={editingMessageKey}
          onCancelEdit={handleEditOpenChange}
          onSaveEdit={(newContent) => applyEdit(newContent, false)}
          onSaveEditAndSubmit={(newContent) => applyEdit(newContent, true)}
        />
      </div>

      {/* Input area: center content and constrain to the same container width */}
      <div className='mx-auto w-full max-w-4xl'>
        <PlaygroundInput
          disabled={isBusy}
          groups={groups}
          groupValue={config.group}
          isGenerating={isGenerating}
          isModelLoading={isLoadingModels}
          modelValue={config.model}
          models={models}
          onGroupChange={(value) => updateConfig('group', value)}
          onGenerateImage={handleGenerateImage}
          onModelChange={(value) => updateConfig('model', value)}
          onStop={stopGeneration}
          onSubmit={handleSendMessage}
        />
      </div>
    </div>
  )
}
