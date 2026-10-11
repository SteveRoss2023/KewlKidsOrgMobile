import React, { useEffect, useRef } from 'react';
import { Platform, TouchableOpacity, TouchableOpacityProps } from 'react-native';

type TooltipButtonProps = TouchableOpacityProps & {
  tooltip: string;
  children: React.ReactNode;
};

/**
 * TouchableOpacity that sets the native HTML `title` on web for hover tooltips,
 * and uses accessibilityLabel for assistive tech on all platforms.
 */
export default function TooltipButton({ tooltip, children, ...props }: TooltipButtonProps) {
  const buttonRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !tooltip) return;

    const setTitle = () => {
      const node = buttonRef.current;
      if (!node) return;
      const getDOMNode = (n: any): HTMLElement | null => {
        if (!n) return null;
        if (n.nodeType === 1) return n;
        if (n._nativeNode) return n._nativeNode;
        if (n._internalFiberInstanceHandleDEV?.stateNode) {
          const stateNode = n._internalFiberInstanceHandleDEV.stateNode;
          if (stateNode?.nodeType === 1) return stateNode;
          if (stateNode?._nativeNode) return stateNode._nativeNode;
        }
        return null;
      };
      const domNode = getDOMNode(node);
      if (domNode) domNode.setAttribute('title', tooltip);
    };

    setTitle();
    const timeout = setTimeout(setTitle, 100);
    return () => clearTimeout(timeout);
  }, [tooltip]);

  return (
    <TouchableOpacity ref={buttonRef} accessibilityLabel={tooltip} {...props}>
      {children}
    </TouchableOpacity>
  );
}
