import Head from 'next/head';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Collapsible, HorizontalDivider, TextArea } from '@tih/ui';

import { useGoogleAnalytics } from '~/components/global/GoogleAnalytics';
import AnswerCommentListItem from '~/components/questions/AnswerCommentListItem';
import FullQuestionCard from '~/components/questions/card/question/FullQuestionCard';
import QuestionAnswerCard from '~/components/questions/card/QuestionAnswerCard';
import FullScreenSpinner from '~/components/questions/FullScreenSpinner';
import BackButtonLayout from '~/components/questions/layout/BackButtonLayout';
import PaginationLoadMoreButton from '~/components/questions/PaginationLoadMoreButton';
import SortOptionsSelect from '~/components/questions/SortOptionsSelect';

import { APP_TITLE } from '~/utils/questions/constants';
import createSlug from '~/utils/questions/createSlug';
import relabelQuestionAggregates from '~/utils/questions/relabelQuestionAggregates';
import { useFormRegister } from '~/utils/questions/useFormRegister';
import { useProtectedCallback } from '~/utils/questions/useProtectedCallback';
import { trpc } from '~/utils/trpc';

import { SortOrder, SortType } from '~/types/questions.d';

export type AnswerQuestionData = {
  answerContent: string;
};

export type QuestionCommentData = {
  commentContent: string;
};

export default function QuestionPage() {
  const router = useRouter();
  const { event } = useGoogleAnalytics();

  const [answerSortOrder, setAnswerSortOrder] = useState<SortOrder>(
    SortOrder.DESC,
  );
  const [answerSortType, setAnswerSortType] = useState<SortType>(SortType.NEW);

  const [commentSortOrder, setCommentSortOrder] = useState<SortOrder>(
    SortOrder.DESC,
  );
  const [commentSortType, setCommentSortType] = useState<SortType>(
    SortType.NEW,
  );

  const {
    register: ansRegister,
    handleSubmit,
    reset: resetAnswer,
    formState: { isDirty, isValid },
  } = useForm<AnswerQuestionData>({ mode: 'onChange' });
  const answerRegister = useFormRegister(ansRegister);

  const {
    register: comRegister,
    handleSubmit: handleCommentSubmitClick,
    reset: resetComment,
    formState: { isDirty: isCommentDirty, isValid: isCommentValid },
  } = useForm<QuestionCommentData>({ mode: 'onChange' });

  const commentRegister = useFormRegister(comRegister);

  const { questionId } = router.query;

  const { data: question } = trpc.useQuery([
    'questions.questions.getQuestionById',
    { id: questionId as string },
  ]);

  const { data: aggregatedEncounters } = trpc.useQuery([
    'questions.questions.encounters.getAggregatedEncounters',
    { questionId: questionId as string },
  ]);

  const relabeledAggregatedEncounters = useMemo(() => {
    if (!aggregatedEncounters) {
      return aggregatedEncounters;
    }

    return relabelQuestionAggregates(aggregatedEncounters);
  }, [aggregatedEncounters]);

  const utils = trpc.useContext();

  const commentInfiniteQuery = trpc.useInfiniteQuery(
    [
      'questions.questions.comments.getQuestionComments',
      {
        limit: 5,
        questionId: questionId as string,
        sortOrder: commentSortOrder,
        sortType: commentSortType,
      },
    ],
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
    },
  );

  const { data: commentData } = commentInfiniteQuery;

  const { mutate: addComment } = trpc.useMutation(
    'questions.questions.comments.user.create',
    {
      onSuccess: () => {
        utils.invalidateQueries(
          'questions.questions.comments.getQuestionComments',
        );
        event({
          action: 'questions.comment',
          category: 'engagement',
          label: 'comment on question',
        });
      },
    },
  );

  const answerInfiniteQuery = trpc.useInfiniteQuery(
    [
      'questions.answers.getAnswers',
      {
        limit: 5,
        questionId: questionId as string,
        sortOrder: answerSortOrder,
        sortType: answerSortType,
      },
    ],
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      keepPreviousData: true,
    },
  );

  const { data: answerData } = answerInfiniteQuery;

  const { mutate: addAnswer } = trpc.useMutation(
    'questions.answers.user.create',
    {
      onSuccess: () => {
        utils.invalidateQueries('questions.answers.getAnswers');
        event({
          action: 'questions.answer',
          category: 'engagement',
          label: 'add answer to question',
        });
      },
    },
  );

  const { mutateAsync: addEncounterAsync } = trpc.useMutation(
    'questions.questions.encounters.user.create',
    {
      onSuccess: () => {
        utils.invalidateQueries(
          'questions.questions.encounters.getAggregatedEncounters',
        );
        utils.invalidateQueries('questions.questions.getQuestionById');
        event({
          action: 'questions.create_question',
          category: 'engagement',
          label: 'create question encounter',
        });
      },
    },
  );

  const handleSubmitAnswer = useProtectedCallback(
    (data: AnswerQuestionData) => {
      addAnswer({
        content: data.answerContent,
        questionId: questionId as string,
      });
      resetAnswer();
    },
  );

  const handleSubmitComment = useProtectedCallback(
    (data: QuestionCommentData) => {
      addComment({
        content: data.commentContent,
        questionId: questionId as string,
      });
      resetComment();
    },
  );

  if (!question) {
    return <FullScreenSpinner />;
  }

  return (
    <>
      <Head>
        <title>
          {question.content} - {APP_TITLE}
        </title>
      </Head>
      <BackButtonLayout href="/questions/browse">
        <div className="flex max-w-7xl flex-1 flex-col gap-2">
          <div className="flex flex-col gap-2 rounded-md border bg-white p-4">
            <FullQuestionCard
              {...question}
              companies={relabeledAggregatedEncounters?.companyCounts ?? {}}
              countries={relabeledAggregatedEncounters?.countryCounts ?? {}}
              createEncounterButtonText="I received this too"
              questionId={question.id}
              receivedCount={undefined}
              roles={relabeledAggregatedEncounters?.roleCounts ?? {}}
              timestamp={question.seenAt.toLocaleDateString(undefined, {
                month: 'short',
                year: 'numeric',
              })}
              upvoteCount={question.numVotes}
              onReceivedSubmit={async (data) => {
                await addEncounterAsync({
                  cityId: data.cityId,
                  companyId: data.company,
                  countryId: data.countryId,
                  questionId: questionId as string,
                  role: data.role,
                  seenAt: data.seenAt,
                  stateId: data.stateId,
                });
              }}
            />
            <div className="ml-16 mr-2">
              <Collapsible
                defaultOpen={true}
                label={
                  <div className="text-primary-700">{`${question.numComments} comment(s)`}</div>
                }>
                <div className="">
                  <div className="flex flex-col gap-2 text-black">
                    <div className="flex justify-end gap-2">
                      <div className="flex items-end gap-2">
                        <SortOptionsSelect
                          sortOrderValue={commentSortOrder}
                          sortTypeValue={commentSortType}
                          onSortOrderChange={setCommentSortOrder}
                          onSortTypeChange={setCommentSortType}
                        />
                      </div>
                    </div>
                    {(commentData?.pages ?? []).flatMap(
                      ({ processedQuestionCommentsData: comments }) =>
                        comments.map((comment) => (
                          <AnswerCommentListItem
                            key={comment.id}
                            answerCommentId={comment.id}
                            authorImageUrl={comment.userImage}
                            authorName={comment.user}
                            content={comment.content}
                            createdAt={comment.createdAt}
                            upvoteCount={comment.numVotes}
                          />
                        )),
                    )}
                    <PaginationLoadMoreButton query={commentInfiniteQuery} />
                    <form
                      className="mt-4"
                      onSubmit={handleCommentSubmitClick(handleSubmitComment)}>
                      <TextArea
                        {...commentRegister('commentContent', {
                          minLength: 1,
                          required: true,
                        })}
                        label="Post a comment"
                        required={true}
                        resize="vertical"
                        rows={2}
                      />
                      <div className="my-3 flex justify-between">
                        <Button
                          disabled={!isCommentDirty || !isCommentValid}
                          label="Post"
                          type="submit"
                          variant="primary"
                        />
                      </div>
                    </form>
                  </div>
                </div>
              </Collapsible>
            </div>
          </div>
          <HorizontalDivider />
          <form onSubmit={handleSubmit(handleSubmitAnswer)}>
            <div className="flex flex-col gap-2">
              <p className="text-md font-semibold">Contribute your answer</p>
              <TextArea
                {...answerRegister('answerContent', {
                  minLength: 1,
                  required: true,
                })}
                isLabelHidden={true}
                label="Contribute your answer"
                required={true}
                resize="vertical"
                rows={5}
              />
            </div>
            <div className="mt-3 mb-1 flex justify-between">
              <Button
                disabled={!isDirty || !isValid}
                label="Contribute"
                type="submit"
                variant="primary"
              />
            </div>
          </form>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xl font-semibold">
              {question.numAnswers} answers
            </p>
            <div className="flex items-end gap-2">
              <SortOptionsSelect
                sortOrderValue={answerSortOrder}
                sortTypeValue={answerSortType}
                onSortOrderChange={setAnswerSortOrder}
                onSortTypeChange={setAnswerSortType}
              />
            </div>
          </div>
          {/* TODO: Add button to load more */}
          {(answerData?.pages ?? []).flatMap(
            ({ processedAnswersData: answers }) =>
              answers.map((answer) => (
                <QuestionAnswerCard
                  key={answer.id}
                  answerId={answer.id}
                  authorImageUrl={answer.userImage}
                  authorName={answer.user}
                  commentCount={answer.numComments}
                  content={answer.content}
                  createdAt={answer.createdAt}
                  href={`${router.asPath}/answer/${answer.id}/${createSlug(
                    answer.content,
                  )}`}
                  upvoteCount={answer.numVotes}
                />
              )),
          )}
          <PaginationLoadMoreButton query={answerInfiniteQuery} />
        </div>
      </BackButtonLayout>
    </>
  );
}
