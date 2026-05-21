import { useMemo } from 'react'
import {
  ArrowRight,
  BookOpen,
  Bot,
  CalendarClock,
  Compass,
  CreditCard,
  ExternalLink,
  FileText,
  KeyRound,
  Link as LinkIcon,
  Pin,
  RadioTower,
  Search,
  Sparkles,
  Star,
  Wallet,
} from 'lucide-react'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Markdown } from '@/components/ui/markdown'
import { cn } from '@/lib/utils'
import {
  type PortalTemplate,
  PortalShell,
  usePortalAppearance,
} from './portal-shell'
import { usePortalSettings } from './portal-settings'
import { createDocsArticleMap } from './docs-center-data'
import type {
  FrontendPortalDocArticle,
  FrontendPortalDocsCenterModuleId,
} from './types'

export const docsCenterSearchSchema = z.object({
  article: z.string().optional(),
  q: z.string().optional(),
})

type DocsCenterSearch = z.infer<typeof docsCenterSearchSchema>

function getQuickLinkIcon(icon: string) {
  switch (icon) {
    case 'key':
      return KeyRound
    case 'wallet':
      return Wallet
    case 'credit-card':
      return CreditCard
    case 'link':
      return LinkIcon
    case 'radio':
      return RadioTower
    case 'bot':
    default:
      return Bot
  }
}

function getInsetClass(template: PortalTemplate) {
  if (template === 'console') {
    return 'rounded-xl border border-cyan-500/18 bg-slate-950/35'
  }
  if (template === 'paper') {
    return 'rounded-md border border-stone-300/80 bg-white/88'
  }
  return 'rounded-2xl border bg-background/70'
}

function sortArticlesByFeaturedRank(articles: FrontendPortalDocArticle[]) {
  return articles
    .map((article, index) => ({ article, index }))
    .sort((left, right) => {
      const pinGap =
        Number(right.article.is_pinned === true) -
        Number(left.article.is_pinned === true)
      if (pinGap !== 0) {
        return pinGap
      }

      const leftSortOrder =
        typeof left.article.sort_order === 'number'
          ? left.article.sort_order
          : Number.POSITIVE_INFINITY
      const rightSortOrder =
        typeof right.article.sort_order === 'number'
          ? right.article.sort_order
          : Number.POSITIVE_INFINITY
      if (leftSortOrder !== rightSortOrder) {
        return leftSortOrder - rightSortOrder
      }

      const rankGap =
        (right.article.featured_rank ?? 0) - (left.article.featured_rank ?? 0)
      if (rankGap !== 0) {
        return rankGap
      }

      return left.index - right.index
    })
    .map((item) => item.article)
}

function getArticleMeta(article: FrontendPortalDocArticle) {
  return [
    {
      label: 'Updated',
      value: article.updated_at || 'Not scheduled',
      icon: CalendarClock,
    },
    {
      label: 'Featured rank',
      value:
        typeof article.featured_rank === 'number'
          ? `#${article.featured_rank}`
          : 'Standard',
      icon: Star,
    },
    {
      label: 'Keywords',
      value: `${article.keywords.length}`,
      icon: Search,
    },
  ]
}

export function DocsCenter(props: { search: DocsCenterSearch }) {
  const appearance = usePortalAppearance()
  const { portal, docsRegistry } = usePortalSettings()
  const docsCenter = portal.docs_center
  const categories = docsRegistry.categories
  const articles = useMemo(
    () =>
      sortArticlesByFeaturedRank(
        docsRegistry.articles.filter((article) => article.status !== 'draft')
      ),
    [docsRegistry.articles]
  )
  const query = (props.search.q || '').trim().toLowerCase()
  const isModuleEnabled = (id: FrontendPortalDocsCenterModuleId) =>
    docsCenter.modules.find((item) => item.id === id)?.enabled ?? true
  const articleMap = useMemo(() => createDocsArticleMap(docsRegistry), [docsRegistry])
  const getCategoryTitle = (categoryId: string) =>
    categories.find((item) => item.id === categoryId)?.title ?? categoryId

  const filteredArticles = useMemo(() => {
    if (!query) {
      return articles
    }

    return articles.filter((article) => {
      const haystack = [
        article.title,
        article.description,
        article.category,
        article.updated_at ?? '',
        ...article.keywords,
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [articles, query])

  const selectedFromSearch = props.search.article
    ? articleMap.get(props.search.article) ?? null
    : null
  const selectedFromSearchPublished =
    selectedFromSearch?.status === 'draft' ? null : selectedFromSearch
  const selectedArticle =
    (selectedFromSearchPublished &&
    filteredArticles.some(
      (article) => article.slug === selectedFromSearchPublished.slug
    )
      ? selectedFromSearchPublished
      : null) ??
    filteredArticles[0] ??
    articles[0]
  const activeArticle = selectedArticle ?? null

  const relatedArticles = useMemo(
    () =>
      sortArticlesByFeaturedRank(
        filteredArticles.filter((article) => article.slug !== activeArticle?.slug)
      ),
    [filteredArticles, activeArticle?.slug]
  )
  const recommendedArticles = relatedArticles.slice(
    0,
    appearance.template === 'paper' ? 5 : 4
  )
  const articleResources = activeArticle?.external_links ?? []
  const articleMeta = activeArticle ? getArticleMeta(activeArticle) : []
  const hasPublishedArticles = articles.length > 0
  const showHeroHighlights = isModuleEnabled('hero_highlights')
  const showCategoryNav = isModuleEnabled('category_nav')
  const showRelatedArticles = isModuleEnabled('related_articles')
  const showFeaturedLinks = isModuleEnabled('featured_links')

  const searchCard = (
    <Card className={appearance.panelClass}>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Search className='size-4' />
          Search docs
        </CardTitle>
        <CardDescription>
          Search by title, category, keyword, or update date from the current article set.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action='/docs-center' method='get' className='space-y-3'>
          <Input
            name='q'
            defaultValue={props.search.q ?? ''}
            placeholder='Search: key, recharge, curl, Codex, model...'
          />
          {selectedArticle?.slug ? (
            <input type='hidden' name='article' value={selectedArticle.slug} />
          ) : null}
        </form>
      </CardContent>
    </Card>
  )

  const categoryCard = showCategoryNav ? (
    <Card className={appearance.panelClass}>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Compass className='size-4' />
          Categories
        </CardTitle>
        <CardDescription>
          Portal-ready navigation inspired by the provided `rcdoc-main` structure.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-5'>
        {categories.map((category) => {
          const categoryArticles = sortArticlesByFeaturedRank(
            filteredArticles.filter((article) => article.category === category.id)
          )

          if (categoryArticles.length === 0) {
            return null
          }

          return (
            <div key={category.id} className='space-y-2'>
              <div>
                <p className='text-sm font-semibold'>{category.title}</p>
                <p className='text-muted-foreground text-xs'>
                  {category.description}
                </p>
              </div>
              <div className='space-y-2'>
                {categoryArticles.map((article) => {
                  const active = article.slug === activeArticle?.slug
                  return (
                    <a
                      key={article.slug}
                      href={`/docs-center?article=${article.slug}${
                        props.search.q
                          ? `&q=${encodeURIComponent(props.search.q)}`
                          : ''
                      }`}
                      className={cn(
                        'block border px-3 py-2 transition-all',
                        getInsetClass(appearance.template),
                        active
                          ? appearance.template === 'console'
                            ? 'border-cyan-400/40 bg-cyan-500/10'
                            : appearance.template === 'paper'
                              ? 'border-stone-500/50 bg-stone-50'
                              : 'border-primary bg-primary/5'
                          : 'hover:bg-background/70 bg-background/40'
                      )}
                    >
                      <div className='flex items-start justify-between gap-3'>
                        <div className='min-w-0'>
                          <p className='text-sm font-medium'>{article.title}</p>
                          <p className='text-muted-foreground mt-1 text-xs'>
                            {article.description}
                          </p>
                        </div>
                        {typeof article.featured_rank === 'number' ? (
                          <Badge variant='outline'>#{article.featured_rank}</Badge>
                        ) : null}
                      </div>
                    </a>
                  )
                })}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  ) : null

  const articleCard = activeArticle ? (
    <Card
      className={cn(
        appearance.panelClass,
        'overflow-hidden',
        appearance.template === 'console' ? 'font-mono' : ''
      )}
    >
      {activeArticle.cover ? (
        <div
          className={cn(
            'overflow-hidden border-b',
            appearance.template === 'paper'
              ? 'max-h-[26rem]'
              : appearance.template === 'console'
                ? 'max-h-72'
                : 'max-h-80'
          )}
        >
          <img
            src={activeArticle.cover}
            alt={activeArticle.title}
            className='h-full w-full object-cover'
            loading='lazy'
          />
        </div>
      ) : null}
      <CardHeader className='border-b'>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='secondary'>{getCategoryTitle(activeArticle.category)}</Badge>
          <Badge variant='outline'>{activeArticle.slug}</Badge>
          {activeArticle.is_pinned ? (
            <Badge variant='outline' className='gap-1'>
              <Pin className='size-3' />
              Pinned
            </Badge>
          ) : null}
          {activeArticle.updated_at ? (
            <Badge variant='outline'>{activeArticle.updated_at}</Badge>
          ) : null}
        </div>
        <CardTitle className='text-2xl'>{activeArticle.title}</CardTitle>
        <CardDescription>{activeArticle.description}</CardDescription>
        <div
          className={cn(
            'grid gap-3 pt-2',
            appearance.template === 'paper'
              ? 'sm:grid-cols-3'
              : appearance.template === 'console'
                ? 'lg:grid-cols-3'
                : 'md:grid-cols-3'
          )}
        >
          {articleMeta.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className={cn(
                  'flex items-start gap-3 px-3 py-3 text-sm',
                  getInsetClass(appearance.template)
                )}
              >
                <span className='bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-xl'>
                  <Icon className='size-4' />
                </span>
                <div className='min-w-0'>
                  <p className='text-muted-foreground text-xs uppercase tracking-[0.14em]'>
                    {item.label}
                  </p>
                  <p className='mt-1 font-medium'>{item.value}</p>
                </div>
              </div>
            )
          })}
        </div>
      </CardHeader>
      <CardContent className='p-5 sm:p-6'>
        <Markdown
          className={cn(
            'max-w-none',
            appearance.template === 'paper'
              ? 'prose prose-stone'
              : 'prose-neutral dark:prose-invert'
          )}
        >
          {activeArticle.markdown}
        </Markdown>
      </CardContent>
    </Card>
  ) : (
    <Card className={appearance.panelClass}>
      <CardHeader>
        <CardTitle>No published articles</CardTitle>
        <CardDescription>
          All docs are currently drafts. Publish at least one article to show the docs center.
        </CardDescription>
      </CardHeader>
    </Card>
  )

  const relatedCard = showRelatedArticles ? (
    <Card className={appearance.panelClass}>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <BookOpen className='size-4' />
          Recommended reading
        </CardTitle>
        <CardDescription>
          Articles are sorted by featured rank first so editorial priorities surface before long-tail content.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {recommendedArticles.map((article) => (
          <a
            key={article.slug}
            href={`/docs-center?article=${article.slug}`}
            className={cn(
              'flex items-center justify-between gap-3 border px-4 py-3 transition-all hover:-translate-y-0.5 hover:bg-background',
              getInsetClass(appearance.template)
            )}
          >
            <span className='min-w-0'>
              <span className='flex items-center gap-2 text-sm font-medium'>
                <span>{article.title}</span>
                {article.is_pinned ? (
                  <Badge variant='outline' className='gap-1'>
                    <Pin className='size-3' />
                    Pinned
                  </Badge>
                ) : null}
                {typeof article.featured_rank === 'number' ? (
                  <Badge variant='outline'>#{article.featured_rank}</Badge>
                ) : null}
              </span>
              <span className='text-muted-foreground mt-1 block text-xs'>
                {article.description}
              </span>
            </span>
            <ArrowRight className='text-muted-foreground size-4 shrink-0' />
          </a>
        ))}
      </CardContent>
    </Card>
  ) : null

  const resourcesCard =
    articleResources.length > 0 ? (
      <Card className={appearance.panelClass}>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <ExternalLink className='size-4' />
            External resources
          </CardTitle>
          <CardDescription>
            Curated outbound resources for this article, managed from the docs registry editor.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          {articleResources.map((link) => (
            <a
              key={`${link.href}-${link.title}`}
              href={link.href}
              target='_blank'
              rel='noreferrer'
              className={cn(
                'flex items-center justify-between gap-3 border px-4 py-3 transition-all hover:-translate-y-0.5 hover:bg-background',
                getInsetClass(appearance.template)
              )}
            >
              <span className='min-w-0 flex-1'>
                <span className='block text-sm font-medium'>{link.title}</span>
                {link.description ? (
                  <span className='text-muted-foreground mt-1 block text-xs'>
                    {link.description}
                  </span>
                ) : null}
              </span>
              <ExternalLink className='text-muted-foreground size-4 shrink-0' />
            </a>
          ))}
        </CardContent>
      </Card>
    ) : null

  const featuredCard = showFeaturedLinks ? (
    <Card className={appearance.panelClass}>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <FileText className='size-4' />
          Portal links
        </CardTitle>
        <CardDescription>
          Jump from documentation into the next portal workflow users usually need.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {docsCenter.featured_links.map((link) => {
          const Icon = getQuickLinkIcon(link.icon)
          return (
            <a
              key={`${link.href}-${link.title}`}
              href={link.href}
              className={cn(
                'flex items-center gap-3 border px-4 py-3 transition-all hover:-translate-y-0.5 hover:bg-background',
                getInsetClass(appearance.template)
              )}
            >
              <span className='bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl'>
                <Icon className='size-5' />
              </span>
              <span className='min-w-0 flex-1'>
                <span className='block text-sm font-medium'>{link.title}</span>
                <span className='text-muted-foreground block text-xs'>
                  {link.description}
                </span>
              </span>
              <ArrowRight className='text-muted-foreground size-4 shrink-0' />
            </a>
          )
        })}
      </CardContent>
    </Card>
  ) : null
  const noPublishedCard = !hasPublishedArticles ? (
    <Card className={appearance.panelClass}>
      <CardHeader>
        <CardTitle>No published articles</CardTitle>
        <CardDescription>
          All docs are currently drafts. Publish at least one article to show the docs center.
        </CardDescription>
      </CardHeader>
    </Card>
  ) : null

  return (
    <PortalShell>
      <section className={cn(appearance.heroClass, 'space-y-6')}>
        <div className='space-y-3'>
          <Badge variant='outline' className={appearance.badgeClass}>
            <Sparkles className='size-3.5' />
            {docsCenter.badge}
          </Badge>
          <div className='space-y-2'>
            <h1 className='max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl'>
              {docsCenter.title}
            </h1>
            <p className='max-w-3xl text-sm leading-7 opacity-90 sm:text-base'>
              {docsCenter.subtitle}
            </p>
          </div>
        </div>

        {showHeroHighlights && docsCenter.hero_highlights.length > 0 ? (
          <div
            className={cn(
              'grid gap-3',
              appearance.template === 'paper'
                ? 'lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]'
                : appearance.template === 'console'
                  ? 'md:grid-cols-3'
                  : 'md:grid-cols-3'
            )}
          >
            {docsCenter.hero_highlights.map((item) => (
              <div
                key={`${item.title}-${item.content}`}
                className={cn(
                  'px-4 py-3 text-sm',
                  appearance.template === 'paper'
                    ? 'rounded-md border border-stone-300/80 bg-white/85'
                    : appearance.template === 'console'
                      ? 'rounded-xl border border-cyan-500/18 bg-slate-950/30 font-mono'
                      : 'rounded-2xl border border-white/15 bg-white/10 backdrop-blur'
                )}
              >
                <p className='font-medium'>{item.title}</p>
                <p className='mt-1 opacity-90'>{item.content}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {appearance.template === 'console' ? (
        <div className='grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_320px]'>
          <div className='space-y-6'>
            {searchCard}
            {categoryCard}
          </div>
          {articleCard}
          {noPublishedCard}
          <div className='space-y-6'>
            {resourcesCard}
            {relatedCard}
            {featuredCard}
          </div>
        </div>
      ) : appearance.template === 'paper' ? (
        <div className='space-y-6'>
          {articleCard}
          {noPublishedCard}
          <div className='grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_320px]'>
            <div className='space-y-6'>
              {searchCard}
              {categoryCard}
            </div>
            <div className='space-y-6'>
              {resourcesCard}
              {relatedCard}
              {featuredCard}
            </div>
          </div>
        </div>
      ) : (
        <div className='grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]'>
          <div className='space-y-6'>
            {searchCard}
            {categoryCard}
          </div>
          <div className='space-y-6'>
            {articleCard}
            {noPublishedCard}
            {(resourcesCard || relatedCard || featuredCard) && (
              <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]'>
                <div className='space-y-6'>
                  {relatedCard}
                  {featuredCard}
                </div>
                <div className='space-y-6'>{resourcesCard}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </PortalShell>
  )
}
