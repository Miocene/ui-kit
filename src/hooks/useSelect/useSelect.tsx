import React, { CSSProperties } from 'react';

import { useClickOutside } from '../useClickOutside/useClickOutside';
import { useDebounce } from '../useDebounce/useDebounce';
import { KeyHandler, useKeys } from '../useKeys/useKeys';
import { usePrevious } from '../usePrevious/usePrevious';

type State = {
  searchValue: string;
  resolvedSearchValue: string;
  isOpen: boolean;
  highlightedIndex: number;
};

type Action = string;

type Reducer = (state: State, newState: State, action: Action) => State;
type Updater = (state: State) => State;

type ScrollToIndexFunctionType = (optionIndex: number) => void;
type OnChangeFunctionType = Function;

type IndexForHighlight = number | ((oldIndex: number) => number);

type SetHandlerArg<T> = boolean | number | T;
type SetHandler<T> = (arg: SetHandlerArg<T>) => void;

export type SelectProps<T> = {
  options: T[];
  value: T[] | null;
  multi?: boolean;
  onChange: OnChangeFunctionType;
  optionsRef: React.MutableRefObject<HTMLDivElement | null>;
  scrollToIndex?: ScrollToIndexFunctionType;
  disabled?: boolean;
  filterFn?(options: T[], searchValue: string): T[];
  getOptionLabel?(option: T): string;
  onCreate?(s: string): void;
};

interface OptionProps extends React.HTMLAttributes<HTMLDivElement> {
  index: number;
  style?: CSSProperties;
  className?: string;
  onClick?(e: React.SyntheticEvent): void;
  onMouseEnter?(e: React.SyntheticEvent): void;
}

type GetOptionPropsResult = {
  onClick(e: React.SyntheticEvent): void;
  onMouseEnter(e: React.SyntheticEvent): void;
} & JSX.IntrinsicElements['div'];

type NativeInputProps = JSX.IntrinsicElements['input'];

interface ToggleProps extends NativeInputProps {
  refKey?: string;
  ref?: React.MutableRefObject<HTMLInputElement | null>;
}

interface GetTogglePropsResult extends React.HTMLProps<HTMLInputElement> {
  disabled?: boolean;
}

type UseSelectResult<T> = {
  searchValue?: string;
  isOpen: boolean;
  highlightedIndex: number;
  visibleOptions: Array<T | { optionForCreate: boolean }>;
  value: T[] | null;
  // Actions
  selectIndex: SetHandler<T>;
  removeValue?: SetHandler<T>;
  setOpen(isOpen: boolean): void;
  setSearch?(value: string): void;
  highlightIndex(index: IndexForHighlight): void;
  // Prop Getters
  getToggleProps(props?: ToggleProps): GetTogglePropsResult;
  getOptionProps(props: OptionProps): GetOptionPropsResult;
};

const actions = {
  setOpen: 'setOpen',
  setSearch: 'setSearch',
  highlightIndex: 'highlightIndex',
};

const initialState = {
  searchValue: '',
  resolvedSearchValue: '',
  isOpen: false,
  highlightedIndex: 0,
};

function useHoistedState(initialState: State): [State, (updater: Updater, action: Action) => void] {
  const reducerRef = React.useRef<Reducer>((old, newState) => newState);
  const [state, _setState] = React.useState<State>(initialState);
  const setState = React.useCallback(
    (updater: Updater, action: Action) => {
      if (!action) {
        throw new Error('An action type is required to update the state');
      }
      return _setState((old) => reducerRef.current(old, updater(old), action));
    },
    [_setState],
  );
  return [state, setState];
}

export function useSelect<T>(params: SelectProps<T>): UseSelectResult<T> {
  const {
    options,
    onChange,
    scrollToIndex,
    optionsRef,
    disabled = false,
    multi = false,
    getOptionLabel,
    onCreate,
  } = params;
  const value = params.value ?? [];
  const [
    { searchValue, isOpen, highlightedIndex, resolvedSearchValue },
    setState,
  ] = useHoistedState(initialState);

  const originalOptions = options;

  // Refs

  const inputRef = React.useRef<HTMLElement>();
  const onBlurRef = React.useRef<{
    cb(e: React.FocusEvent): void;
    event: React.FocusEvent | null;
  }>();
  const scrollToIndexRef = React.useRef<ScrollToIndexFunctionType>();
  scrollToIndexRef.current = scrollToIndex;

  const onChangeRef = React.useRef<OnChangeFunctionType>();
  onChangeRef.current = onChange;

  const filterFnRef = React.useRef<(options: T[], searchValue: string) => T[]>();
  filterFnRef.current = (options: T[], searchValue: string): T[] => {
    if (typeof getOptionLabel === 'function') {
      let tempOptions: T[] = [];
      // if (typeof getGroupOptions === 'function') {
      //   tempOptions = options.map((option) => {
      //     const filteredOptions = getGroupOptions(option)
      //       .filter((option: T) =>
      //         getOptionLabel(option)
      //           .toLowerCase()
      //           .includes(searchValue.toLowerCase()),
      //       )
      //       .sort((a) => {
      //         return getOptionLabel(a)
      //           .toLowerCase()
      //           .indexOf(searchValue.toLowerCase());
      //       });

      //     return {
      //       ...option,
      //       // /filteredOptions,
      //     };
      //   });
      //   // .filter((option) => option.filteredOptions && option.filteredOptions.length > 0);
      // } else {
      tempOptions = options
        .filter((option: T) =>
          getOptionLabel(option)
            .toLowerCase()
            .includes(searchValue.toLowerCase()),
        )
        .sort((a) => {
          return getOptionLabel(a)
            .toLowerCase()
            .indexOf(searchValue.toLowerCase());
        });
      // }

      const optionForCreate =
        typeof onCreate === 'function' ? (({ optionForCreate: true } as unknown) as T) : null;

      return optionForCreate ? [optionForCreate, ...tempOptions] : tempOptions;
    }
    return options;
  };

  const filteredOptions = React.useMemo(() => {
    if (resolvedSearchValue && resolvedSearchValue !== '' && filterFnRef.current) {
      return filterFnRef.current(options, resolvedSearchValue);
    }
    return originalOptions;
  }, [originalOptions, resolvedSearchValue]);

  const getSelectedOptionIndex = (): number => {
    if (value) {
      const selectedOptionIndex = filteredOptions.indexOf(value[0]);

      return selectedOptionIndex > 0 ? selectedOptionIndex : 0;
    }

    return 0;
  };

  // Actions

  const setOpen = React.useCallback(
    (newIsOpen: boolean) => {
      setState(
        (old) => ({
          ...old,
          isOpen: newIsOpen,
        }),
        actions.setOpen,
      );
    },
    [setState],
  );

  const setResolvedSearch = useDebounce((value: string) => {
    setState(
      (old) => ({
        ...old,
        resolvedSearchValue: value,
      }),
      actions.setSearch,
    );
  }, 300);

  const setSearch = React.useCallback(
    (value) => {
      setState(
        (old) => ({
          ...old,
          searchValue: value,
        }),
        actions.setSearch,
      );
      setResolvedSearch(value);
    },
    [setState, setResolvedSearch],
  );

  const prevIsOpen = usePrevious(isOpen);

  React.useLayoutEffect(() => {
    if (value !== null && !prevIsOpen && isOpen) {
      const currentHighlightIndex = getSelectedOptionIndex();
      if (filteredOptions.length > 0) {
        scrollToIndexRef.current && scrollToIndexRef.current(currentHighlightIndex);
      }
    }
  });

  const highlightIndex = React.useCallback(
    (indexForHighlight: IndexForHighlight) => {
      setState((old) => {
        return {
          ...old,
          highlightedIndex: Math.min(
            Math.max(
              0,
              typeof indexForHighlight === 'function'
                ? indexForHighlight(old.highlightedIndex)
                : indexForHighlight,
            ),
            filteredOptions.length - 1,
          ),
        };
      }, actions.highlightIndex);
    },
    [filteredOptions, setState],
  );

  const selectIndex = React.useCallback(
    (index) => {
      const option = filteredOptions[index];
      if (option && onChangeRef.current) {
        if (multi) {
          onChangeRef.current([...value, option]);
        } else {
          onChangeRef.current(option);
          setOpen(false);
        }
      }
    },
    [filteredOptions, value, setOpen],
  );

  // Handlers

  const handleValueFieldChange = (e: React.SyntheticEvent): void => {
    // !disabled && setOpen(true);

    const target = e.target as HTMLFormElement;
    !disabled && setSearch(target.value);
  };

  const handleValueFieldClick = (): void => {
    !disabled && setOpen(!isOpen);
    if (multi) {
      setSearch('');
    }
  };

  const handleValueFieldFocus = (): void => handleValueFieldClick();

  const removeValue = React.useCallback(
    (index) => {
      onChangeRef.current && onChangeRef.current(value.filter((d, i) => i !== index));
    },
    [value],
  );

  // Prop Getters

  const ArrowUp: KeyHandler = () => (_, e: React.SyntheticEvent): void => {
    e.preventDefault();
    !disabled && setOpen(true);
    highlightIndex((old) => old - 1);
  };

  const ArrowDown: KeyHandler = () => (_, e: React.SyntheticEvent): void => {
    e.preventDefault();
    !disabled && setOpen(true);
    highlightIndex((old) => old + 1);
  };

  const Enter: KeyHandler = () => (_, e: React.KeyboardEvent): void => {
    if (isOpen) {
      if (searchValue || filteredOptions[highlightedIndex]) {
        e.preventDefault();
      }
      if (filteredOptions[highlightedIndex]) {
        selectIndex(highlightedIndex);
      }
    }
  };

  const Escape = (): void => {
    setOpen(false);
  };

  const Tab = (): void => {
    setOpen(false);
  };

  const Backspace = (): void => {
    if (!multi || searchValue) {
      return;
    }
    removeValue(value.length - 1);
  };

  const getKeyProps = useKeys({
    ArrowUp: ArrowUp(),
    ArrowDown: ArrowDown(),
    PageUp: ArrowUp(),
    PageDown: ArrowDown(),
    Home: ArrowUp(),
    End: ArrowDown(),
    Enter: Enter(),
    Escape,
    Tab,
    Backspace,
  });

  const getToggleProps = ({
    refKey = 'ref',
    ref,
    onChange,
    onFocus,
    onClick,
    onBlur,
    ...rest
  }: ToggleProps = {}): GetTogglePropsResult => {
    const sourceRef = ref;
    return getKeyProps({
      [refKey]: (el: HTMLInputElement) => {
        inputRef.current = el;
        if (sourceRef) {
          sourceRef.current = el;
        }
      },
      onChange: (e) => {
        handleValueFieldChange(e);
        if (typeof onChange === 'function') {
          onChange(e);
        }
      },
      onFocus: (e) => {
        handleValueFieldFocus();
        if (typeof onFocus === 'function') {
          onFocus(e);
        }
      },
      onClick: (e) => {
        handleValueFieldClick();
        if (typeof onClick === 'function') {
          onClick(e);
        }
      },
      onBlur: (e) => {
        if (typeof onBlur === 'function' && onBlurRef.current) {
          e.persist();
          onBlurRef.current = { cb: onBlur, event: e };
        }
      },
      ...rest,
    });
  };

  const getOptionProps = ({
    index,
    onClick,
    onMouseEnter,
    ...rest
  }: OptionProps): GetOptionPropsResult => {
    return {
      ...rest,
      onClick: (e: React.SyntheticEvent): void => {
        selectIndex(index);
        if (typeof onClick === 'function') {
          onClick(e);
        }
      },
      onMouseEnter: (e: React.SyntheticEvent): void => {
        highlightIndex(index);
        if (typeof onMouseEnter === 'function') {
          onMouseEnter(e);
        }
      },
    };
  };

  // Effects

  // When the user clicks outside of the options box
  // while open, we need to close the dropdown
  useClickOutside({
    isActive: isOpen,
    ignoreClicksInsideRefs: [optionsRef],
    handler: () => {
      setOpen(false);
    },
  });

  React.useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  // When searching, activate the first option
  React.useEffect(() => {
    const currentHighlightIndex = getSelectedOptionIndex();
    highlightIndex(currentHighlightIndex);
  }, [highlightIndex]);

  // When we open and close the options, set the highlightedIndex to 0
  React.useEffect(() => {
    const currentHighlightIndex = getSelectedOptionIndex();
    highlightIndex(currentHighlightIndex);

    if (!isOpen && onBlurRef.current && onBlurRef.current.event) {
      onBlurRef.current.cb(onBlurRef.current.event);
      onBlurRef.current.event = null;
    }
  }, [isOpen, highlightIndex]);

  // When the highlightedIndex changes, scroll to that item
  React.useEffect(() => {
    if (filteredOptions.length > 0) {
      scrollToIndexRef.current && scrollToIndexRef.current(highlightedIndex);
    }
  }, [highlightedIndex]);

  React.useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current && inputRef.current.focus();
      const currentHighlightIndex = getSelectedOptionIndex();
      scrollToIndexRef.current && scrollToIndexRef.current(currentHighlightIndex);
    }
  }, [isOpen, inputRef.current]);

  return {
    // State
    isOpen,
    highlightedIndex,
    visibleOptions: filteredOptions,
    value,
    // Actions
    selectIndex,
    setOpen,
    highlightIndex,
    // Prop Getters
    getToggleProps,
    getOptionProps,
  };
}
