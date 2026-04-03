"""
Mask R-CNN Multi-GPU Support for Keras.
"""

import tensorflow as tf
import keras.backend as K
import keras.layers as KL
import keras.models as KM


class ParallelModel(KM.Model):
    """Creates a copy of the model on each GPU, slices inputs, and merges outputs."""

    def __init__(self, keras_model, gpu_count):
        """Wrap a Keras model for multi-GPU training."""
        self.inner_model = keras_model
        self.gpu_count = gpu_count
        merged_outputs = self.make_parallel()
        super(ParallelModel, self).__init__(inputs=self.inner_model.inputs,
                                            outputs=merged_outputs)

    def __getattribute__(self, attrname):
        """Redirect load/save methods to the inner model (where weights are stored)."""
        if 'load' in attrname or 'save' in attrname:
            return getattr(self.inner_model, attrname)
        return super(ParallelModel, self).__getattribute__(attrname)

    def summary(self, *args, **kwargs):
        """Show summaries of both the wrapper and the inner model."""
        super(ParallelModel, self).summary(*args, **kwargs)
        self.inner_model.summary(*args, **kwargs)

    def make_parallel(self):
        """Create model replicas on each GPU, split inputs, and merge outputs."""
        # Slice inputs on CPU to save bandwidth and memory
        input_slices = {name: tf.split(x, self.gpu_count)
                        for name, x in zip(self.inner_model.input_names,
                                           self.inner_model.inputs)}

        output_names = self.inner_model.output_names
        outputs_all = [[] for _ in range(len(self.inner_model.outputs))]

        # Run a replica on each GPU
        for i in range(self.gpu_count):
            with tf.device('/gpu:%d' % i):
                with tf.name_scope('tower_%d' % i):
                    zipped_inputs = zip(self.inner_model.input_names,
                                        self.inner_model.inputs)
                    inputs = [
                        KL.Lambda(lambda s: input_slices[name][i],
                                  output_shape=lambda s: (None,) + s[1:])(tensor)
                        for name, tensor in zipped_inputs]
                    outputs = self.inner_model(inputs)
                    if not isinstance(outputs, list):
                        outputs = [outputs]
                    for l, o in enumerate(outputs):
                        outputs_all[l].append(o)

        # Merge outputs on CPU
        with tf.device('/cpu:0'):
            merged = []
            for outputs, name in zip(outputs_all, output_names):
                if K.int_shape(outputs[0]) == ():
                    # Average scalar outputs (losses/metrics)
                    m = KL.Lambda(lambda o: tf.add_n(o) / len(outputs), name=name)(outputs)
                else:
                    # Concatenate batch outputs
                    m = KL.Concatenate(axis=0, name=name)(outputs)
                merged.append(m)
        return merged